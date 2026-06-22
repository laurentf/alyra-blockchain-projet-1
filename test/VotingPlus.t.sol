// SPDX-License-Identifier: MIT
pragma solidity 0.8.34;

import {Test} from "forge-std/Test.sol";
import {VotingPlus} from "../contracts/VotingPlus.sol";

/// @title Property-based (fuzz) tests for VotingPlus
/// @notice Complements the TypeScript integration suite. A fuzz test does not
///         pick its inputs by hand: the runner replays it with hundreds of
///         random inputs and checks that a stated property holds for ALL of
///         them. This explores the pure on-chain logic (arithmetic, tie rule,
///         identity checks) far beyond a handful of hand-written cases.
/// @dev The test contract is itself the election administrator (owner); voters
///      are simulated with `vm.prank`. Everything stays inside the EVM, which
///      is exactly what the native Solidity runner is good at.
contract VotingPlusFuzzTest is Test {
    uint256 constant MIN_TITLE_LENGTH = 3;

    // ---- title length is enforced at construction, for every input ----

    /// Any title shorter than the minimum must be rejected with its real length.
    function testFuzz_constructorRejectsShortTitle(string calldata title) public {
        vm.assume(bytes(title).length < MIN_TITLE_LENGTH);
        vm.expectRevert(
            abi.encodeWithSelector(
                VotingPlus.TitleTooShort.selector,
                bytes(title).length,
                MIN_TITLE_LENGTH
            )
        );
        new VotingPlus(title, address(this));
    }

    /// Any title of at least the minimum length is accepted and stored verbatim.
    function testFuzz_constructorAcceptsLongEnoughTitle(string calldata title) public {
        vm.assume(bytes(title).length >= MIN_TITLE_LENGTH);
        VotingPlus voting = new VotingPlus(title, address(this));
        assertEq(voting.electionTitle(), title);
    }

    // ---- a proposal title is a unique identity, whatever the description ----

    /// Re-submitting an already used title always reverts, for any descriptions.
    function testFuzz_duplicateProposalTitleAlwaysReverts(
        string calldata title,
        string calldata descA,
        string calldata descB
    ) public {
        vm.assume(bytes(title).length >= MIN_TITLE_LENGTH);
        address voter = makeAddr("voter");

        VotingPlus voting = new VotingPlus("Fuzz election", address(this));
        voting.registerVoter(voter);
        voting.closeVoterRegistrationAndStartProposalsRegistration();

        vm.prank(voter);
        voting.addProposal(title, descA);

        vm.prank(voter);
        vm.expectRevert(VotingPlus.DuplicateProposal.selector);
        voting.addProposal(title, descB);
    }

    // ---- vote accounting is exact, whatever the distribution ----

    /// turnout == number of voters, and == the sum of the per-proposal tallies.
    function testFuzz_voteAccountingInvariant(
        uint256 voterCount,
        uint256 proposalCount,
        uint256 distribution
    ) public {
        voterCount = bound(voterCount, 1, 12);
        proposalCount = bound(proposalCount, 1, 4);

        address[] memory voters = _makeVoters(voterCount);
        VotingPlus voting = _openElection(proposalCount, voters);

        uint256[] memory expected = new uint256[](proposalCount);
        for (uint256 i = 0; i < voterCount; i++) {
            uint256 pid = uint256(keccak256(abi.encode(distribution, i))) % proposalCount;
            vm.prank(voters[i]);
            voting.vote(pid);
            expected[pid]++;
        }

        assertEq(voting.votesCount(), voterCount);

        uint256 sum;
        for (uint256 i = 0; i < proposalCount; i++) {
            (, , uint256 voteCount, ) = voting.proposals(i);
            assertEq(voteCount, expected[i]);
            sum += voteCount;
        }
        assertEq(sum, voterCount);
    }

    // ---- a winner exists iff a single proposal strictly leads ----

    /// hasWinner is true exactly when one proposal alone holds the top score;
    /// any shared top score makes the election void (ElectionTied).
    function testFuzz_winnerIffUniqueStrictMax(
        uint256 voterCount,
        uint256 distribution
    ) public {
        uint256 proposalCount = 3;
        voterCount = bound(voterCount, 3, 12);

        address[] memory voters = _makeVoters(voterCount);
        VotingPlus voting = _openElection(proposalCount, voters);

        uint256[] memory expected = new uint256[](proposalCount);
        for (uint256 i = 0; i < voterCount; i++) {
            uint256 pid = uint256(keccak256(abi.encode(distribution, i))) % proposalCount;
            vm.prank(voters[i]);
            voting.vote(pid);
            expected[pid]++;
        }

        voting.closeVotingSession();
        voting.tallyVotes();

        uint256 maxCount;
        for (uint256 i = 0; i < proposalCount; i++) {
            if (expected[i] > maxCount) maxCount = expected[i];
        }
        uint256 leaders;
        for (uint256 i = 0; i < proposalCount; i++) {
            if (expected[i] == maxCount) leaders++;
        }
        bool shouldHaveWinner = leaders == 1;

        assertEq(voting.hasWinner(), shouldHaveWinner);
        if (shouldHaveWinner) {
            assertEq(voting.getWinner().voteCount, maxCount);
        } else {
            vm.expectRevert(VotingPlus.ElectionTied.selector);
            voting.getWinner();
        }
    }

    // ---- helpers ----

    function _makeVoters(uint256 n) internal returns (address[] memory voters) {
        voters = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            voters[i] = makeAddr(string.concat("voter", vm.toString(i)));
        }
    }

    /// @dev Deploys an election (this contract is admin), registers `voters`,
    ///      lets voters[0] file `proposalCount` proposals, and opens voting.
    function _openElection(uint256 proposalCount, address[] memory voters)
        internal
        returns (VotingPlus voting)
    {
        voting = new VotingPlus("Fuzz election", address(this));
        for (uint256 i = 0; i < voters.length; i++) {
            voting.registerVoter(voters[i]);
        }
        voting.closeVoterRegistrationAndStartProposalsRegistration();
        for (uint256 i = 0; i < proposalCount; i++) {
            vm.prank(voters[0]);
            voting.addProposal(string.concat("Proposal ", vm.toString(i)), "");
        }
        voting.closeProposalsRegistration();
        voting.startVotingSession();
    }
}
