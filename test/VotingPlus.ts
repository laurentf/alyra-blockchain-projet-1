import { expect } from "chai";
import { network } from "hardhat";

const { ethers } = await network.create();

// Mirror of the WorkflowStatus enum in VotingPlus.sol
const Status = {
  RegisteringVoters: 0,
  ProposalsRegistrationStarted: 1,
  ProposalsRegistrationEnded: 2,
  VotingSessionStarted: 3,
  VotingSessionEnded: 4,
  VotesTallied: 5,
} as const;

describe("VotingPlus", function () {
  let admin: any, voter1: any, voter2: any, voter3: any, outsider: any;
  let voting: any;

  beforeEach(async function () {
    [admin, voter1, voter2, voter3, outsider] = await ethers.getSigners();
    voting = await ethers.deployContract("VotingPlus", ["Budget 2026", admin.address]);
  });

  // ---- helpers ----

  /** Registers voter1 & voter2, opens proposals, adds two proposals, opens voting. */
  async function openVoting() {
    await voting.registerVoter(voter1.address);
    await voting.registerVoter(voter2.address);
    await voting.closeVoterRegistrationAndStartProposalsRegistration();
    await voting.connect(voter1).addProposal("Pizza", "cheese");
    await voting.connect(voter2).addProposal("Sushi", "fish");
    await voting.closeProposalsRegistration();
    await voting.startVotingSession();
  }

  /**
   * Registers `voters`, opens proposals, has voters[i] submit titles[i], then
   * opens the voting session. Requires voters.length >= titles.length.
   */
  async function openVotingWith(voters: any[], titles: string[]) {
    for (const v of voters) await voting.registerVoter(v.address);
    await voting.closeVoterRegistrationAndStartProposalsRegistration();
    for (let i = 0; i < titles.length; i++) {
      await voting.connect(voters[i]).addProposal(titles[i], "");
    }
    await voting.closeProposalsRegistration();
    await voting.startVotingSession();
  }

  describe("Deployment", function () {
    it("sets title, owner and the initial RegisteringVoters status", async function () {
      expect(await voting.electionTitle()).to.equal("Budget 2026");
      expect(await voting.owner()).to.equal(admin.address);
      expect(await voting.currentWorkflowStatus()).to.equal(Status.RegisteringVoters);
      expect(await voting.hasWinner()).to.equal(false);
      expect(await voting.votesCount()).to.equal(0n);
    });

    it("reverts when the title is shorter than 3 bytes", async function () {
      await expect(
        ethers.deployContract("VotingPlus", ["ab", admin.address]),
      )
        .to.be.revertedWithCustomError(voting, "TitleTooShort")
        .withArgs(2, 3);
    });
  });

  describe("registerVoter", function () {
    it("whitelists a voter and emits VoterRegistered", async function () {
      await expect(voting.registerVoter(voter1.address))
        .to.emit(voting, "VoterRegistered")
        .withArgs(voter1.address);
      const v = await voting.voters(voter1.address);
      expect(v.isRegistered).to.equal(true);
    });

    it("reverts for a non-admin caller", async function () {
      await expect(voting.connect(outsider).registerVoter(voter1.address))
        .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount")
        .withArgs(outsider.address);
    });

    it("reverts on a duplicate registration", async function () {
      await voting.registerVoter(voter1.address);
      await expect(voting.registerVoter(voter1.address))
        .to.be.revertedWithCustomError(voting, "VoterAlreadyRegistered")
        .withArgs(voter1.address);
    });

    it("reverts once registration is closed (wrong status)", async function () {
      await voting.closeVoterRegistrationAndStartProposalsRegistration();
      await expect(voting.registerVoter(voter1.address))
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.RegisteringVoters, Status.ProposalsRegistrationStarted);
    });
  });

  describe("Workflow transitions", function () {
    it("runs the full happy path with WorkflowStatusChange events", async function () {
      await voting.registerVoter(voter1.address);

      await expect(voting.closeVoterRegistrationAndStartProposalsRegistration())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(Status.RegisteringVoters, Status.ProposalsRegistrationStarted);

      await voting.connect(voter1).addProposal("Pizza", "");

      await expect(voting.closeProposalsRegistration())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(Status.ProposalsRegistrationStarted, Status.ProposalsRegistrationEnded);

      await expect(voting.startVotingSession())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(Status.ProposalsRegistrationEnded, Status.VotingSessionStarted);

      await voting.connect(voter1).vote(0);

      await expect(voting.closeVotingSession())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(Status.VotingSessionStarted, Status.VotingSessionEnded);

      await expect(voting.tallyVotes())
        .to.emit(voting, "WorkflowStatusChange")
        .withArgs(Status.VotingSessionEnded, Status.VotesTallied);
    });

    it("forbids a non-admin from advancing the workflow", async function () {
      await expect(
        voting.connect(outsider).closeVoterRegistrationAndStartProposalsRegistration(),
      ).to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
    });

    it("forbids skipping a stage", async function () {
      await expect(voting.startVotingSession())
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.ProposalsRegistrationEnded, Status.RegisteringVoters);
    });

    it("requires at least one proposal to close registration", async function () {
      await voting.closeVoterRegistrationAndStartProposalsRegistration();
      await expect(voting.closeProposalsRegistration()).to.be.revertedWithCustomError(
        voting,
        "NoProposalRegistered",
      );
    });

    it("requires at least one vote to close the session", async function () {
      await voting.registerVoter(voter1.address);
      await voting.closeVoterRegistrationAndStartProposalsRegistration();
      await voting.connect(voter1).addProposal("Pizza", "");
      await voting.closeProposalsRegistration();
      await voting.startVotingSession();
      await expect(voting.closeVotingSession()).to.be.revertedWithCustomError(
        voting,
        "NoVoteCast",
      );
    });
  });

  describe("addProposal", function () {
    beforeEach(async function () {
      await voting.registerVoter(voter1.address);
      await voting.closeVoterRegistrationAndStartProposalsRegistration();
    });

    it("registers a proposal with its proposer and emits ProposalRegistered", async function () {
      await expect(voting.connect(voter1).addProposal("Pizza", "cheese"))
        .to.emit(voting, "ProposalRegistered")
        .withArgs(0);
      const p = await voting.proposals(0);
      expect(p.title).to.equal("Pizza");
      expect(p.description).to.equal("cheese");
      expect(p.voteCount).to.equal(0n);
      expect(p.proposer).to.equal(voter1.address);
    });

    it("accepts an empty description", async function () {
      await expect(voting.connect(voter1).addProposal("Pizza", "")).to.emit(
        voting,
        "ProposalRegistered",
      );
    });

    it("reverts for a non-voter", async function () {
      await expect(voting.connect(outsider).addProposal("Pizza", ""))
        .to.be.revertedWithCustomError(voting, "VoterNotRegistered")
        .withArgs(outsider.address);
    });

    it("reverts on a too-short title", async function () {
      await expect(voting.connect(voter1).addProposal("ab", ""))
        .to.be.revertedWithCustomError(voting, "TitleTooShort")
        .withArgs(2, 3);
    });

    it("reverts on a duplicate title", async function () {
      await voting.connect(voter1).addProposal("Pizza", "first");
      await expect(
        voting.connect(voter1).addProposal("Pizza", "second"),
      ).to.be.revertedWithCustomError(voting, "DuplicateProposal");
    });

    it("reverts outside the proposals phase", async function () {
      await voting.connect(voter1).addProposal("Pizza", "");
      await voting.closeProposalsRegistration();
      await expect(voting.connect(voter1).addProposal("Sushi", ""))
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.ProposalsRegistrationStarted, Status.ProposalsRegistrationEnded);
    });
  });

  describe("vote", function () {
    beforeEach(openVoting);

    it("records a vote and emits Voted", async function () {
      await expect(voting.connect(voter1).vote(0))
        .to.emit(voting, "Voted")
        .withArgs(voter1.address, 0);

      const p = await voting.proposals(0);
      expect(p.voteCount).to.equal(1n);
      expect(await voting.votesCount()).to.equal(1n);

      const v = await voting.voters(voter1.address);
      expect(v.hasVoted).to.equal(true);
      expect(v.votedProposalId).to.equal(0n);
    });

    it("reverts for a non-voter", async function () {
      await expect(voting.connect(outsider).vote(0))
        .to.be.revertedWithCustomError(voting, "VoterNotRegistered")
        .withArgs(outsider.address);
    });

    it("reverts on a double vote", async function () {
      await voting.connect(voter1).vote(0);
      await expect(voting.connect(voter1).vote(1))
        .to.be.revertedWithCustomError(voting, "AlreadyVoted")
        .withArgs(voter1.address);
    });

    it("reverts on an invalid proposal id", async function () {
      await expect(voting.connect(voter1).vote(42))
        .to.be.revertedWithCustomError(voting, "InvalidProposalId")
        .withArgs(42);
    });

    it("reverts outside the voting phase", async function () {
      await voting.connect(voter1).vote(0);
      await voting.closeVotingSession();
      await expect(voting.connect(voter2).vote(1))
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.VotingSessionStarted, Status.VotingSessionEnded);
    });
  });

  describe("tallyVotes & getWinner", function () {
    it("getWinner reverts before the votes are tallied", async function () {
      await expect(voting.getWinner())
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.VotesTallied, Status.RegisteringVoters);
    });

    it("designates a clear winner", async function () {
      await openVoting();
      await voting.connect(voter1).vote(0); // Pizza
      await voting.connect(voter2).vote(0); // Pizza
      await voting.closeVotingSession();
      await voting.tallyVotes();

      expect(await voting.hasWinner()).to.equal(true);
      const w = await voting.getWinner();
      expect(w.title).to.equal("Pizza");
      expect(w.voteCount).to.equal(2n);
    });

    it("voids the election on a tie (TieDetected + ElectionTied)", async function () {
      await openVoting();
      await voting.connect(voter1).vote(0); // Pizza
      await voting.connect(voter2).vote(1); // Sushi → 1-1 tie
      await voting.closeVotingSession();

      await expect(voting.tallyVotes())
        .to.emit(voting, "TieDetected")
        .withArgs(1, 2);

      expect(await voting.hasWinner()).to.equal(false);
      await expect(voting.getWinner()).to.be.revertedWithCustomError(
        voting,
        "ElectionTied",
      );
    });

    it("forbids a non-admin from tallying", async function () {
      await openVoting();
      await voting.connect(voter1).vote(0);
      await voting.closeVotingSession();
      await expect(voting.connect(outsider).tallyVotes()).to.be.revertedWithCustomError(
        voting,
        "OwnableUnauthorizedAccount",
      );
    });

    it("picks the right winner among three proposals ([3,1,1])", async function () {
      const v = (await ethers.getSigners()).slice(1, 6); // 5 voters
      await openVotingWith(v, ["Alpha", "Bravo", "Charlie"]);
      await voting.connect(v[0]).vote(0);
      await voting.connect(v[1]).vote(0);
      await voting.connect(v[2]).vote(0); // Alpha = 3
      await voting.connect(v[3]).vote(1); // Bravo = 1
      await voting.connect(v[4]).vote(2); // Charlie = 1
      await voting.closeVotingSession();
      await voting.tallyVotes();

      expect(await voting.hasWinner()).to.equal(true);
      const w = await voting.getWinner();
      expect(w.title).to.equal("Alpha");
      expect(w.voteCount).to.equal(3n);
    });

    it("voids on a partial tie at the top ([2,2,1])", async function () {
      const v = (await ethers.getSigners()).slice(1, 6); // 5 voters
      await openVotingWith(v, ["Alpha", "Bravo", "Charlie"]);
      await voting.connect(v[0]).vote(0);
      await voting.connect(v[1]).vote(0); // Alpha = 2
      await voting.connect(v[2]).vote(1);
      await voting.connect(v[3]).vote(1); // Bravo = 2
      await voting.connect(v[4]).vote(2); // Charlie = 1
      await voting.closeVotingSession();

      // max vote count = 2, shared by 2 proposals
      await expect(voting.tallyVotes())
        .to.emit(voting, "TieDetected")
        .withArgs(2, 2);
      expect(await voting.hasWinner()).to.equal(false);
      await expect(voting.getWinner()).to.be.revertedWithCustomError(
        voting,
        "ElectionTied",
      );
    });
  });

  describe("Roles (admin has no vote privilege)", function () {
    async function openSingleProposalVote() {
      await voting.registerVoter(voter1.address);
      await voting.closeVoterRegistrationAndStartProposalsRegistration();
      await voting.connect(voter1).addProposal("Pizza", "");
      await voting.closeProposalsRegistration();
      await voting.startVotingSession();
    }

    it("rejects the admin's vote when not whitelisted", async function () {
      await openSingleProposalVote();
      await expect(voting.vote(0))
        .to.be.revertedWithCustomError(voting, "VoterNotRegistered")
        .withArgs(admin.address);
    });

    it("lets the admin vote once self-registered like anyone", async function () {
      await voting.registerVoter(admin.address);
      await openSingleProposalVote();
      await expect(voting.vote(0)).to.emit(voting, "Voted").withArgs(admin.address, 0);
    });
  });

  describe("Locked ownership", function () {
    it("reverts on transferOwnership", async function () {
      await expect(
        voting.transferOwnership(outsider.address),
      ).to.be.revertedWithCustomError(voting, "OwnershipLocked");
    });

    it("reverts on renounceOwnership", async function () {
      await expect(voting.renounceOwnership()).to.be.revertedWithCustomError(
        voting,
        "OwnershipLocked",
      );
    });
  });
});
