// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

// v5 so need constructor with Ownable(msg.sender) in constructor
import "@openzeppelin/contracts/access/Ownable.sol";

contract Voting is Ownable {
    struct Voter {
        bool isRegistered;
        bool hasVoted;
        uint votedProposalId;
    }

    struct Proposal {
        string description;
        uint voteCount;
    }

    enum WorkflowStatus {
        RegisteringVoters,
        ProposalsRegistrationStarted,
        ProposalsRegistrationEnded,
        VotingSessionStarted,
        VotingSessionEnded,
        VotesTallied
    }

    uint constant MIN_DESCRIPTION_LENGTH = 3; // anti-noise threshold for proposals

    WorkflowStatus public currentWorkflowStatus; // initialized to RegisteringVoters by default
    mapping(address => Voter) public voters;
    Proposal[] public proposals;
    uint public winningProposalId;
    uint public votesCount; // total votes cast, useful for the vote guard in closeVotingSession()
    mapping(bytes32 => bool) private descriptionExists; // keccak fingerprints, blocks exact duplicates

    event VoterRegistered(address voterAddress);
    event WorkflowStatusChange(
        WorkflowStatus previousStatus,
        WorkflowStatus newStatus
    );
    event ProposalRegistered(uint proposalId);
    event Voted(address voter, uint proposalId);

    error VoterNotRegistered(address account);
    error VoterAlreadyRegistered(address account);
    error WrongWorkflowStatus(WorkflowStatus expected, WorkflowStatus current);
    error AlreadyVoted(address account);
    error InvalidProposalId(uint proposalId);
    error NoProposalRegistered();
    error NoVoteCast();
    error DescriptionTooShort(uint provided, uint minimum);
    error DuplicateProposal();

    // Restricts a function to whitelisted voters (the admin counts only if registered)
    modifier onlyVoters() {
        require(
            voters[msg.sender].isRegistered,
            VoterNotRegistered(msg.sender)
        );
        _;
    }

    // Restricts a function to a specific workflow status
    modifier onlyDuring(WorkflowStatus _status) {
        require(
            currentWorkflowStatus == _status,
            WrongWorkflowStatus(_status, currentWorkflowStatus)
        );
        _;
    }

    constructor() Ownable(msg.sender) {}

    // Invariant, no defensive check needed: VotesTallied is only reachable through
    // closeProposalsRegistration (guarantees proposals.length >= 1, array never shrinks)
    // and closeVotingSession (guarantees >= 1 vote), and tallyVotes only writes
    // in-bounds indices, so proposals[winningProposalId] always exists here.
    function getWinner()
        external
        view
        onlyDuring(WorkflowStatus.VotesTallied)
        returns (Proposal memory)
    {
        return proposals[winningProposalId];
    }

    // ==================================================
    //                  VOTER FUNCTIONS
    // ==================================================
    function addProposal(
        string calldata _description
    )
        external
        onlyVoters
        onlyDuring(WorkflowStatus.ProposalsRegistrationStarted)
    {
        // Anti-noise: reject too-short descriptions (note: byte length, not characters)
        uint descriptionLength = bytes(_description).length;
        require(
            descriptionLength >= MIN_DESCRIPTION_LENGTH,
            DescriptionTooShort(descriptionLength, MIN_DESCRIPTION_LENGTH)
        );

        // Anti vote-splitting: reject byte-exact duplicates via keccak fingerprint.
        // (Exact match only)
        bytes32 descriptionHash = keccak256(bytes(_description));
        require(!descriptionExists[descriptionHash], DuplicateProposal());
        descriptionExists[descriptionHash] = true;

        // Add the proposal
        proposals.push(Proposal(_description, 0));
        uint proposalId = proposals.length - 1;

        // Emit an event when a proposal is registered
        emit ProposalRegistered(proposalId);
    }

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

        // Emit an event when a vote is cast
        emit Voted(msg.sender, _proposalId);
    }

    // ==================================================
    //                  ADMIN FUNCTIONS
    // ==================================================
    function registerVoter(
        address _voterAddress
    ) external onlyOwner onlyDuring(WorkflowStatus.RegisteringVoters) {
        // A voter cannot be registered more than once
        require(
            !voters[_voterAddress].isRegistered,
            VoterAlreadyRegistered(_voterAddress)
        );

        // Register the voter
        voters[_voterAddress] = Voter(true, false, 0);
        // Emit an event when a voter is registered
        emit VoterRegistered(_voterAddress);
    }

    // state machine functions

    function closeVoterRegistrationAndStartProposalsRegistration()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.RegisteringVoters)
    {
        // Change the workflow status to ProposalsRegistrationStarted so voter registration now closed
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.ProposalsRegistrationStarted;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    function closeProposalsRegistration()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.ProposalsRegistrationStarted)
    {
        // Guard: without any proposal the election could never produce a winner.
        require(proposals.length > 0, NoProposalRegistered());

        // Change the workflow status to ProposalsRegistrationEnded so proposals registration now closed
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.ProposalsRegistrationEnded;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    function startVotingSession()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.ProposalsRegistrationEnded)
    {
        // Change the workflow status to VotingSessionStarted so voting is now open
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.VotingSessionStarted;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    function closeVotingSession()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.VotingSessionStarted)
    {
        // Guard: a tally over zero votes would be meaningless.
        require(votesCount > 0, NoVoteCast());

        // Change the workflow status to VotingSessionEnded so voting session now closed
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.VotingSessionEnded;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    function tallyVotes()
        external
        onlyOwner
        onlyDuring(WorkflowStatus.VotingSessionEnded)
    {
        // Tally the votes and determine the winning proposal
        uint winningVoteCount = 0;
        for (uint i = 0; i < proposals.length; i++) {
            if (proposals[i].voteCount > winningVoteCount) {
                winningVoteCount = proposals[i].voteCount;
                winningProposalId = i;
            }
        }

        // Change the workflow status to VotesTallied
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.VotesTallied;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }
}
