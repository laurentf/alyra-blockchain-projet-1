// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title VotingPlus - hardened voting for a small organization
/// @author laurentf
/// @notice Runs a single election: the administrator whitelists voters, voters
///         submit proposals then vote, the administrator tallies the votes and
///         anyone can verify the winning proposal.
/// @dev Extends the Voting deliverable with documented, justified hardening
///      (see README). One deployed contract = one election. The lifecycle is
///      enforced by a one-way state machine (WorkflowStatus): stages cannot be
///      skipped, replayed or reverted. Built on OpenZeppelin Ownable v5 - the
///      deployer is the administrator.
contract VotingPlus is Ownable {
    /// @notice A participant of the election.
    /// @dev isRegistered is the membership flag: the mapping returns a zeroed
    ///      struct for unknown addresses, this boolean tells real voters apart.
    struct Voter {
        bool isRegistered;
        bool hasVoted;
        uint votedProposalId;
    }

    /// @notice A proposal submitted by a voter.
    struct Proposal {
        string description;
        uint voteCount;
    }

    /// @notice The election stages, in chronological order.
    /// @dev The declaration order IS the process order. The default value
    ///      (RegisteringVoters, first member) is the stage right after deployment.
    enum WorkflowStatus {
        RegisteringVoters,
        ProposalsRegistrationStarted,
        ProposalsRegistrationEnded,
        VotingSessionStarted,
        VotingSessionEnded,
        VotesTallied
    }

    /// @notice Minimum byte length accepted for a proposal description (anti-noise).
    uint constant MIN_DESCRIPTION_LENGTH = 3;

    /// @notice The current stage of the election, readable by anyone.
    WorkflowStatus public currentWorkflowStatus;

    /// @notice The whitelist; votes are public by design (the ballot is not secret).
    mapping(address => Voter) public voters;

    /// @notice All submitted proposals; a proposal id is its index in this array.
    Proposal[] public proposals;

    /// @notice The id of the winning proposal.
    /// @dev Only meaningful once VotesTallied — use getWinner(), which enforces it.
    uint public winningProposalId;

    /// @notice Total number of votes cast (turnout).
    /// @dev Feeds the NoVoteCast liveness guard in closeVotingSession().
    uint public votesCount;

    /// @notice True once the tally found a single clear winner; stays false
    ///         forever on a tie (the election is then void by design).
    /// @dev Named so its default value is honest at every stage: false reads
    ///      as "no winner (yet)".
    bool public hasWinner;

    /// @dev Keccak fingerprints of submitted descriptions, blocks byte-exact duplicates.
    mapping(bytes32 => bool) private descriptionExists;

    /// @notice Emitted when the administrator whitelists a voter.
    event VoterRegistered(address voterAddress);

    /// @notice Emitted on every stage transition of the election.
    event WorkflowStatusChange(
        WorkflowStatus previousStatus,
        WorkflowStatus newStatus
    );

    /// @notice Emitted when a proposal is registered, with its assigned id.
    event ProposalRegistered(uint proposalId);

    /// @notice Emitted when a voter casts a vote for a proposal.
    event Voted(address voter, uint proposalId);

    /// @notice Emitted when the tally ends on a tie: the election is void.
    /// @param maxVoteCount The highest score reached.
    /// @param tiedProposalsCount How many proposals share that score.
    event TieDetected(uint maxVoteCount, uint tiedProposalsCount);

    /// @notice The caller is not on the whitelist.
    error VoterNotRegistered(address account);
    /// @notice The address is already on the whitelist.
    error VoterAlreadyRegistered(address account);
    /// @notice The action is not allowed at the current stage of the election.
    error WrongWorkflowStatus(WorkflowStatus expected, WorkflowStatus current);
    /// @notice The caller has already cast their vote.
    error AlreadyVoted(address account);
    /// @notice The proposal id does not exist.
    error InvalidProposalId(uint proposalId);
    /// @notice Proposals registration cannot close without at least one proposal.
    error NoProposalRegistered();
    /// @notice The voting session cannot close without at least one vote.
    error NoVoteCast();
    /// @notice The proposal description is shorter than the minimum length.
    error DescriptionTooShort(uint provided, uint minimum);
    /// @notice A byte-identical proposal has already been submitted.
    error DuplicateProposal();
    /// @notice Ownership transfers and renouncement are permanently disabled.
    error OwnershipLocked();
    /// @notice No winner exists: the election ended in a tie and is void.
    error ElectionTied();

    /// @notice Restricts a function to whitelisted voters.
    /// @dev The administrator gets no ballot privilege from the role: they must
    ///      be whitelisted like anyone else to participate.
    modifier onlyVoters() {
        require(
            voters[msg.sender].isRegistered,
            VoterNotRegistered(msg.sender)
        );
        _;
    }

    /// @notice Restricts a function to a specific stage of the election.
    modifier onlyDuring(WorkflowStatus _status) {
        require(
            currentWorkflowStatus == _status,
            WrongWorkflowStatus(_status, currentWorkflowStatus)
        );
        _;
    }

    /// @notice The deployer becomes the administrator of the election.
    constructor() Ownable(msg.sender) {}

    /// @notice Disabled: the administrator is the deployer, for the whole life
    ///         of the contract.
    /// @dev The election can never be handed over: the admin role is immutable
    ///      by construction ("the administrator is the one who deploys").
    function transferOwnership(address) public pure override {
        revert OwnershipLocked();
    }

    /// @notice Disabled: the election can never be orphaned.
    /// @dev Renouncing mid-election would permanently freeze every remaining
    ///      transition. Trade-off (documented): a lost admin key means a dead
    ///      election - redeploy, one contract = one election.
    function renounceOwnership() public pure override {
        revert OwnershipLocked();
    }

    /// @notice Returns the winning proposal (description and vote count),
    ///         callable by anyone once the votes are tallied — reverts with
    ///         ElectionTied if the election ended on a tie.
    /// @dev When hasWinner is false, winningProposalId only holds a loop
    ///      residue with no meaning: this getter is the only reliable API.
    ///      Array access needs no defensive check: VotesTallied is only
    ///      reachable with proposals.length >= 1 (the array never shrinks)
    ///      and tallyVotes only writes in-bounds indices.
    /// @return The winning Proposal.
    function getWinner()
        external
        view
        onlyDuring(WorkflowStatus.VotesTallied)
        returns (Proposal memory)
    {
        require(hasWinner, ElectionTied());
        return proposals[winningProposalId];
    }

    // ==================================================
    //                  VOTER FUNCTIONS
    // ==================================================

    /// @notice Submit a proposal during the proposals registration stage.
    /// @dev Rejects descriptions under MIN_DESCRIPTION_LENGTH bytes (byte length,
    ///      not characters) and byte-exact duplicates (keccak fingerprint,
    ///      anti vote-splitting). Normalization/trim is a front-end concern.
    /// @param _description The proposal text.
    function addProposal(
        string calldata _description
    )
        external
        onlyVoters
        onlyDuring(WorkflowStatus.ProposalsRegistrationStarted)
    {
        // Checks: anti-noise threshold, then duplicate fingerprint
        uint descriptionLength = bytes(_description).length;
        require(
            descriptionLength >= MIN_DESCRIPTION_LENGTH,
            DescriptionTooShort(descriptionLength, MIN_DESCRIPTION_LENGTH)
        );
        bytes32 descriptionHash = keccak256(bytes(_description));
        require(!descriptionExists[descriptionHash], DuplicateProposal());

        // Effects: record the fingerprint and the proposal (id = its index)
        descriptionExists[descriptionHash] = true;
        proposals.push(Proposal(_description, 0));
        uint proposalId = proposals.length - 1;

        emit ProposalRegistered(proposalId);
    }

    /// @notice Cast your single vote for a proposal during the voting session.
    /// @dev Follows the Checks-Effects pattern; also increments the global
    ///      turnout counter used by the closeVotingSession liveness guard.
    /// @param _proposalId The id (array index) of the chosen proposal.
    function vote(
        uint _proposalId
    ) external onlyVoters onlyDuring(WorkflowStatus.VotingSessionStarted) {
        require(!voters[msg.sender].hasVoted, AlreadyVoted(msg.sender));
        require(_proposalId < proposals.length, InvalidProposalId(_proposalId));

        // Record the vote
        voters[msg.sender].hasVoted = true;
        voters[msg.sender].votedProposalId = _proposalId;
        proposals[_proposalId].voteCount++;
        votesCount++;

        emit Voted(msg.sender, _proposalId);
    }

    // ==================================================
    //                  ADMIN FUNCTIONS
    // ==================================================

    /// @notice Whitelist a voter (step 1 of the process).
    /// @param _voterAddress The Ethereum address to whitelist.
    function registerVoter(
        address _voterAddress
    ) external onlyOwner onlyDuring(WorkflowStatus.RegisteringVoters) {
        require(
            !voters[_voterAddress].isRegistered,
            VoterAlreadyRegistered(_voterAddress)
        );

        voters[_voterAddress] = Voter(true, false, 0);

        emit VoterRegistered(_voterAddress);
    }

    // ---------- state machine ----------

    /// @notice Opens the proposals registration session (step 2 of the process).
    /// @dev Leaving RegisteringVoters de facto closes voter registration.
    function closeVoterRegistrationAndStartProposalsRegistration()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.RegisteringVoters)
    {
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.ProposalsRegistrationStarted;

        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    /// @notice Closes the proposals registration session (step 4 of the process).
    /// @dev Liveness guard: requires at least one proposal, checked at the last
    ///      gate where voters can still fix it by proposing — any later check
    ///      would deadlock the one-way machine.
    function closeProposalsRegistration()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.ProposalsRegistrationStarted)
    {
        require(proposals.length > 0, NoProposalRegistered());

        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.ProposalsRegistrationEnded;

        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    /// @notice Opens the voting session (step 5 of the process).
    function startVotingSession()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.ProposalsRegistrationEnded)
    {
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.VotingSessionStarted;

        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    /// @notice Closes the voting session (step 7 of the process).
    /// @dev Liveness guard: requires at least one vote, same repairable-gate
    ///      principle as closeProposalsRegistration.
    function closeVotingSession()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.VotingSessionStarted)
    {
        require(votesCount > 0, NoVoteCast());

        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.VotingSessionEnded;

        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    /// @notice Tallies the votes (step 8 of the process). A single clear
    ///         winner sets hasWinner; a tie leaves the election without
    ///         winner, forever (void by design).
    /// @dev Naive O(n) scan, acceptable for a small whitelisted organization.
    ///      Tie policy aligned with on-chain governance practice (e.g.
    ///      Governor requires forVotes > againstVotes): no clear majority,
    ///      no action — redeploy to run a new election. The startup noise of
    ///      zero-vote equalities is harmless: the NoVoteCast guard guarantees
    ///      the final maximum is >= 1, which resets the tie counter on the way.
    function tallyVotes()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.VotingSessionEnded)
    {
        uint winningVoteCount = 0;
        uint tiedProposalsCount = 0;
        for (uint i = 0; i < proposals.length; i++) {
            uint count = proposals[i].voteCount;
            if (count > winningVoteCount) {
                // new strict maximum: it stands alone
                winningVoteCount = count;
                winningProposalId = i;
                tiedProposalsCount = 1;
            } else if (count == winningVoteCount) {
                // another proposal reaches the current maximum
                tiedProposalsCount++;
            }
        }

        hasWinner = (tiedProposalsCount == 1);
        if (!hasWinner) {
            emit TieDetected(winningVoteCount, tiedProposalsCount);
        }

        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.VotesTallied;

        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }
}
