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

    WorkflowStatus public currentWorkflowStatus; // initialized to RegisteringVoters by default
    mapping(address => Voter) public voters;
    Proposal[] public proposals;
    uint public winningProposalId;
    uint public votesCount; // total votes cast, useful for the vote guard in closeVotingSession()

    event VoterRegistered(address voterAddress);
    event WorkflowStatusChange(
        WorkflowStatus previousStatus,
        WorkflowStatus newStatus
    );
    event ProposalRegistered(uint proposalId);
    event Voted(address voter, uint proposalId);

    constructor() Ownable(msg.sender) {}

    // ==================================================
    //                  VOTER FUNCTIONS
    // ==================================================
    function addProposal(string calldata _description) external {
        // Only registered voters can add proposals, and it must be during the ProposalsRegistrationStarted phase
        require(
            currentWorkflowStatus ==
                WorkflowStatus.ProposalsRegistrationStarted,
            "Proposals registration is not open"
        );
        require(
            voters[msg.sender].isRegistered,
            "Only registered voters can add proposals"
        );

        // Add the proposal
        proposals.push(Proposal(_description, 0));
        uint proposalId = proposals.length - 1;

        // Emit an event when a proposal is registered
        emit ProposalRegistered(proposalId);
    }

    function vote(uint _proposalId) external {
        // Only registered voters can vote, and it must be during the VotingSessionStarted phase
        require(
            currentWorkflowStatus == WorkflowStatus.VotingSessionStarted,
            "Voting session is not open"
        );
        require(
            voters[msg.sender].isRegistered,
            "Only registered voters can vote"
        );
        require(
            !voters[msg.sender].hasVoted,
            "Voter has already voted"
        );
        require(
            _proposalId < proposals.length,
            "Invalid proposal ID"
        );

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
    function registerVoter(address _voterAddress) external onlyOwner {
        // Only the owner can register voters, and it must be during the RegisteringVoters phase
        require(
            currentWorkflowStatus == WorkflowStatus.RegisteringVoters,
            "Voters registration is not open"
        );
        // A voter cannot be registered more than once
        require(
            !voters[_voterAddress].isRegistered,
            "Voter is already registered"
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
    {
        // Only the owner can start the proposals registration, and it must be during the RegisteringVoters phase
        require(
            currentWorkflowStatus == WorkflowStatus.RegisteringVoters,
            "Cannot start proposals registration at this stage"
        );

        // Change the workflow status to ProposalsRegistrationStarted so voter registration now closed
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.ProposalsRegistrationStarted;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    function closeProposalsRegistration() external onlyOwner {
        // Only the owner can end the proposals registration, and it must be during the ProposalsRegistrationStarted phase
        require(
            currentWorkflowStatus ==
                WorkflowStatus.ProposalsRegistrationStarted,
            "Cannot end proposals registration at this stage"
        );
        // Guard: without any proposal the election could never produce a winner.
        require(proposals.length > 0, "At least one proposal is required");

        // Change the workflow status to ProposalsRegistrationEnded so proposals registration now closed
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.ProposalsRegistrationEnded;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    function startVotingSession() external onlyOwner {
        // Only the owner can start the voting session, and it must be during the ProposalsRegistrationEnded phase
        require(
            currentWorkflowStatus == WorkflowStatus.ProposalsRegistrationEnded,
            "Cannot start voting session at this stage"
        );

        // Change the workflow status to VotingSessionStarted so voting is now open
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.VotingSessionStarted;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    function closeVotingSession() external onlyOwner {
        // Only the owner can end the voting session, and it must be during the VotingSessionStarted phase
        require(
            currentWorkflowStatus == WorkflowStatus.VotingSessionStarted,
            "Cannot end voting session at this stage"
        );
        // Guard: a tally over zero votes would be meaningless.
        require(votesCount > 0, "At least one vote is required");

        // Change the workflow status to VotingSessionEnded so voting session now closed
        WorkflowStatus previousStatus = currentWorkflowStatus;
        currentWorkflowStatus = WorkflowStatus.VotingSessionEnded;

        // Emit an event when the workflow status changes
        emit WorkflowStatusChange(previousStatus, currentWorkflowStatus);
    }

    function tallyVotes() external onlyOwner {
        // Only the owner can tally votes, and it must be during the VotingSessionEnded phase
        require(
            currentWorkflowStatus == WorkflowStatus.VotingSessionEnded,
            "Cannot tally votes at this stage"
        );

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
