import { expect } from "chai";
import { network } from "hardhat";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/types";

const { ethers, networkHelpers } = await network.create();
const { loadFixture } = networkHelpers;

// Mirror of the WorkflowStatus enum in VotingPlus.sol
const Status = {
  RegisteringVoters: 0,
  ProposalsRegistrationStarted: 1,
  ProposalsRegistrationEnded: 2,
  VotingSessionStarted: 3,
  VotingSessionEnded: 4,
  VotesTallied: 5,
} as const;

// ---- fixtures ----
// loadFixture deploys once, then restores a snapshot before each test that
// reuses it: faster than redeploying, and each test still starts from a
// pristine state. Scenarios are layered (open* build on top of deploy).

/** Fresh contract + named signers; election still in RegisteringVoters. */
async function deployVotingFixture() {
  const [admin, voter1, voter2, voter3, outsider] = await ethers.getSigners();
  // Fully typed: Hardhat generates ethers bindings under types/ (regenerated on
  // compile), so `voting` is a typed VotingPlus and `.connect(signer)` stays typed.
  const voting = await ethers.deployContract("VotingPlus", [
    "Budget 2026",
    admin.address,
  ]);
  return { voting, admin, voter1, voter2, voter3, outsider };
}

/** The typed VotingPlus contract, derived from the deploy fixture (no `any`). */
type VotingContract = Awaited<ReturnType<typeof deployVotingFixture>>["voting"];

/** voter1 registered, proposals registration open. */
async function proposalsOpenFixture() {
  const ctx = await deployVotingFixture();
  await ctx.voting.registerVoter(ctx.voter1.address);
  await ctx.voting.closeVoterRegistrationAndStartProposalsRegistration();
  return ctx;
}

/** voter1 & voter2 registered, two proposals (Pizza/Sushi), voting open. */
async function openVotingFixture() {
  const ctx = await deployVotingFixture();
  const { voting, voter1, voter2 } = ctx;
  await voting.registerVoter(voter1.address);
  await voting.registerVoter(voter2.address);
  await voting.closeVoterRegistrationAndStartProposalsRegistration();
  await voting.connect(voter1).addProposal("Pizza", "cheese");
  await voting.connect(voter2).addProposal("Sushi", "fish");
  await voting.closeProposalsRegistration();
  await voting.startVotingSession();
  return ctx;
}

/** voter1 registered, a single proposal "Pizza", voting open. */
async function singleProposalVotingFixture() {
  const ctx = await deployVotingFixture();
  const { voting, voter1 } = ctx;
  await voting.registerVoter(voter1.address);
  await voting.closeVoterRegistrationAndStartProposalsRegistration();
  await voting.connect(voter1).addProposal("Pizza", "");
  await voting.closeProposalsRegistration();
  await voting.startVotingSession();
  return ctx;
}

/** Same as above, but the admin is also whitelisted (can vote like anyone). */
async function singleProposalVotingWithAdminVoterFixture() {
  const ctx = await deployVotingFixture();
  const { voting, admin, voter1 } = ctx;
  await voting.registerVoter(admin.address);
  await voting.registerVoter(voter1.address);
  await voting.closeVoterRegistrationAndStartProposalsRegistration();
  await voting.connect(voter1).addProposal("Pizza", "");
  await voting.closeProposalsRegistration();
  await voting.startVotingSession();
  return ctx;
}

/**
 * Parameterized scenario (variable voter/proposal counts, so it can't be a
 * cached fixture): registers `voters`, opens proposals, has voters[i] submit
 * titles[i], then opens the voting session. Requires voters.length >= titles.length.
 */
async function openVotingWith(
  voting: VotingContract,
  voters: HardhatEthersSigner[],
  titles: string[],
) {
  for (const v of voters) await voting.registerVoter(v.address);
  await voting.closeVoterRegistrationAndStartProposalsRegistration();
  for (let i = 0; i < titles.length; i++) {
    await voting.connect(voters[i]).addProposal(titles[i], "");
  }
  await voting.closeProposalsRegistration();
  await voting.startVotingSession();
}

describe("VotingPlus", function () {
  describe("Deployment", function () {
    it("sets title, owner and the initial RegisteringVoters status", async function () {
      const { voting, admin } = await loadFixture(deployVotingFixture);
      expect(await voting.electionTitle()).to.equal("Budget 2026");
      expect(await voting.owner()).to.equal(admin.address);
      expect(await voting.currentWorkflowStatus()).to.equal(Status.RegisteringVoters);
      expect(await voting.hasWinner()).to.equal(false);
      expect(await voting.votesCount()).to.equal(0n);
    });

    it("reverts when the title is shorter than 3 bytes", async function () {
      const { voting, admin } = await loadFixture(deployVotingFixture);
      await expect(ethers.deployContract("VotingPlus", ["ab", admin.address]))
        .to.be.revertedWithCustomError(voting, "TitleTooShort")
        .withArgs(2, 3);
    });
  });

  describe("registerVoter", function () {
    it("whitelists a voter and emits VoterRegistered", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingFixture);
      await expect(voting.registerVoter(voter1.address))
        .to.emit(voting, "VoterRegistered")
        .withArgs(voter1.address);
      const v = await voting.voters(voter1.address);
      expect(v.isRegistered).to.equal(true);
    });

    it("reverts for a non-admin caller", async function () {
      const { voting, voter1, outsider } = await loadFixture(deployVotingFixture);
      await expect(voting.connect(outsider).registerVoter(voter1.address))
        .to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount")
        .withArgs(outsider.address);
    });

    it("reverts on a duplicate registration", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingFixture);
      await voting.registerVoter(voter1.address);
      await expect(voting.registerVoter(voter1.address))
        .to.be.revertedWithCustomError(voting, "VoterAlreadyRegistered")
        .withArgs(voter1.address);
    });

    it("reverts once registration is closed (wrong status)", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingFixture);
      await voting.closeVoterRegistrationAndStartProposalsRegistration();
      await expect(voting.registerVoter(voter1.address))
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.RegisteringVoters, Status.ProposalsRegistrationStarted);
    });
  });

  describe("Workflow transitions", function () {
    it("runs the full happy path with WorkflowStatusChange events", async function () {
      const { voting, voter1 } = await loadFixture(deployVotingFixture);
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
      const { voting, outsider } = await loadFixture(deployVotingFixture);
      await expect(
        voting.connect(outsider).closeVoterRegistrationAndStartProposalsRegistration(),
      ).to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
    });

    it("forbids skipping a stage", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      await expect(voting.startVotingSession())
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.ProposalsRegistrationEnded, Status.RegisteringVoters);
    });

    it("requires at least one proposal to close registration", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      await voting.closeVoterRegistrationAndStartProposalsRegistration();
      await expect(voting.closeProposalsRegistration()).to.be.revertedWithCustomError(
        voting,
        "NoProposalRegistered",
      );
    });

    it("requires at least one vote to close the session", async function () {
      const { voting } = await loadFixture(singleProposalVotingFixture);
      await expect(voting.closeVotingSession()).to.be.revertedWithCustomError(
        voting,
        "NoVoteCast",
      );
    });
  });

  describe("addProposal", function () {
    it("registers a proposal with its proposer and emits ProposalRegistered", async function () {
      const { voting, voter1 } = await loadFixture(proposalsOpenFixture);
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
      const { voting, voter1 } = await loadFixture(proposalsOpenFixture);
      await expect(voting.connect(voter1).addProposal("Pizza", "")).to.emit(
        voting,
        "ProposalRegistered",
      );
    });

    it("reverts for a non-voter", async function () {
      const { voting, outsider } = await loadFixture(proposalsOpenFixture);
      await expect(voting.connect(outsider).addProposal("Pizza", ""))
        .to.be.revertedWithCustomError(voting, "VoterNotRegistered")
        .withArgs(outsider.address);
    });

    it("reverts on a too-short title", async function () {
      const { voting, voter1 } = await loadFixture(proposalsOpenFixture);
      await expect(voting.connect(voter1).addProposal("ab", ""))
        .to.be.revertedWithCustomError(voting, "TitleTooShort")
        .withArgs(2, 3);
    });

    it("reverts on a duplicate title", async function () {
      const { voting, voter1 } = await loadFixture(proposalsOpenFixture);
      await voting.connect(voter1).addProposal("Pizza", "first");
      await expect(
        voting.connect(voter1).addProposal("Pizza", "second"),
      ).to.be.revertedWithCustomError(voting, "DuplicateProposal");
    });

    it("reverts outside the proposals phase", async function () {
      const { voting, voter1 } = await loadFixture(proposalsOpenFixture);
      await voting.connect(voter1).addProposal("Pizza", "");
      await voting.closeProposalsRegistration();
      await expect(voting.connect(voter1).addProposal("Sushi", ""))
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.ProposalsRegistrationStarted, Status.ProposalsRegistrationEnded);
    });
  });

  describe("vote", function () {
    it("records a vote and emits Voted", async function () {
      const { voting, voter1 } = await loadFixture(openVotingFixture);
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
      const { voting, outsider } = await loadFixture(openVotingFixture);
      await expect(voting.connect(outsider).vote(0))
        .to.be.revertedWithCustomError(voting, "VoterNotRegistered")
        .withArgs(outsider.address);
    });

    it("reverts on a double vote", async function () {
      const { voting, voter1 } = await loadFixture(openVotingFixture);
      await voting.connect(voter1).vote(0);
      await expect(voting.connect(voter1).vote(1))
        .to.be.revertedWithCustomError(voting, "AlreadyVoted")
        .withArgs(voter1.address);
    });

    it("reverts on an invalid proposal id", async function () {
      const { voting, voter1 } = await loadFixture(openVotingFixture);
      await expect(voting.connect(voter1).vote(42))
        .to.be.revertedWithCustomError(voting, "InvalidProposalId")
        .withArgs(42);
    });

    it("reverts outside the voting phase", async function () {
      const { voting, voter1, voter2 } = await loadFixture(openVotingFixture);
      await voting.connect(voter1).vote(0);
      await voting.closeVotingSession();
      await expect(voting.connect(voter2).vote(1))
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.VotingSessionStarted, Status.VotingSessionEnded);
    });
  });

  describe("tallyVotes & getWinner", function () {
    it("getWinner reverts before the votes are tallied", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      await expect(voting.getWinner())
        .to.be.revertedWithCustomError(voting, "WrongWorkflowStatus")
        .withArgs(Status.VotesTallied, Status.RegisteringVoters);
    });

    it("designates a clear winner", async function () {
      const { voting, voter1, voter2 } = await loadFixture(openVotingFixture);
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
      const { voting, voter1, voter2 } = await loadFixture(openVotingFixture);
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
      const { voting, voter1, outsider } = await loadFixture(openVotingFixture);
      await voting.connect(voter1).vote(0);
      await voting.closeVotingSession();
      await expect(voting.connect(outsider).tallyVotes()).to.be.revertedWithCustomError(
        voting,
        "OwnableUnauthorizedAccount",
      );
    });

    it("picks the right winner among three proposals ([3,1,1])", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      const voters = (await ethers.getSigners()).slice(1, 6); // 5 voters
      await openVotingWith(voting, voters, ["Alpha", "Bravo", "Charlie"]);
      await voting.connect(voters[0]).vote(0);
      await voting.connect(voters[1]).vote(0);
      await voting.connect(voters[2]).vote(0); // Alpha = 3
      await voting.connect(voters[3]).vote(1); // Bravo = 1
      await voting.connect(voters[4]).vote(2); // Charlie = 1
      await voting.closeVotingSession();
      await voting.tallyVotes();

      expect(await voting.hasWinner()).to.equal(true);
      const w = await voting.getWinner();
      expect(w.title).to.equal("Alpha");
      expect(w.voteCount).to.equal(3n);
    });

    it("voids on a partial tie at the top ([2,2,1])", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      const voters = (await ethers.getSigners()).slice(1, 6); // 5 voters
      await openVotingWith(voting, voters, ["Alpha", "Bravo", "Charlie"]);
      await voting.connect(voters[0]).vote(0);
      await voting.connect(voters[1]).vote(0); // Alpha = 2
      await voting.connect(voters[2]).vote(1);
      await voting.connect(voters[3]).vote(1); // Bravo = 2
      await voting.connect(voters[4]).vote(2); // Charlie = 1
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
    it("rejects the admin's vote when not whitelisted", async function () {
      const { voting, admin } = await loadFixture(singleProposalVotingFixture);
      await expect(voting.vote(0))
        .to.be.revertedWithCustomError(voting, "VoterNotRegistered")
        .withArgs(admin.address);
    });

    it("lets the admin vote once self-registered like anyone", async function () {
      const { voting, admin } = await loadFixture(
        singleProposalVotingWithAdminVoterFixture,
      );
      await expect(voting.vote(0)).to.emit(voting, "Voted").withArgs(admin.address, 0);
    });
  });

  describe("Locked ownership", function () {
    it("reverts on transferOwnership", async function () {
      const { voting, outsider } = await loadFixture(deployVotingFixture);
      await expect(
        voting.transferOwnership(outsider.address),
      ).to.be.revertedWithCustomError(voting, "OwnershipLocked");
    });

    it("reverts on renounceOwnership", async function () {
      const { voting } = await loadFixture(deployVotingFixture);
      await expect(voting.renounceOwnership()).to.be.revertedWithCustomError(
        voting,
        "OwnershipLocked",
      );
    });
  });
});
