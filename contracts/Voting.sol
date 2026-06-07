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

    event VoterRegistered(address voterAddress);
    event WorkflowStatusChange(
        WorkflowStatus previousStatus,
        WorkflowStatus newStatus
    );
    event ProposalRegistered(uint proposalId);
    event Voted(address voter, uint proposalId);

    constructor() Ownable(msg.sender) {}

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
}
