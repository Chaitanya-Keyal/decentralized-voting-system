// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import {Test} from "forge-std/Test.sol";

import {Election} from "../src/Election.sol";
import {SemaphoreElection} from "../src/SemaphoreElection.sol";
import {TallyLib} from "../src/TallyLib.sol";

/// @dev The ballots in fixtures/semaphore-ballots.json are real Semaphore v4 proofs made in
/// TypeScript (packages/shared/src/semaphore.test.ts) for an election at a fixed address, so the
/// browser's proofs and the on-chain verifier are tested against each other.
contract SemaphoreElectionTest is Test {
    struct Ballot {
        uint256 choice;
        uint256 nullifier;
        uint256[8] points;
    }

    SemaphoreVerifier internal verifier;
    SemaphoreElection internal implementation;
    SemaphoreElection internal election;
    Election.Schedule internal schedule;
    string internal fixture;

    address internal authority = makeAddr("authority");
    address internal registrar = makeAddr("registrar");
    address internal relayer = makeAddr("relayer");

    function setUp() public {
        fixture =
            vm.readFile(string.concat(vm.projectRoot(), "/test/fixtures/semaphore-ballots.json"));
        verifier = new SemaphoreVerifier();
        implementation = new SemaphoreElection(ISemaphoreVerifier(address(verifier)));
        uint64 t = uint64(block.timestamp);
        schedule = Election.Schedule(t + 100, t + 200, t + 300, t + 400);
    }

    // -------------------------------------------------------------------------------------------
    // Ballots
    // -------------------------------------------------------------------------------------------

    function test_castVote_countsValidBallots() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        for (uint256 i; i < 3; ++i) {
            _cast(_ballot(string.concat(".ballots[", vm.toString(i), "]")));
        }
        uint256[] memory tally = election.tally();
        assertEq(tally[0], 0);
        assertEq(tally[1], 2);
        assertEq(tally[2], 1);
        assertEq(election.ballotsCast(), 3);
    }

    function test_castVote_emitsTheNullifierAndChoiceOnly() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        Ballot memory b = _ballot(".ballots[0]");
        vm.expectEmit(address(election));
        emit Election.VoteCast(bytes32(b.nullifier), b.choice);
        _cast(b);
    }

    function test_castVote_rejectsASecondBallotFromTheSameVoter() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        Ballot memory b = _ballot(".ballots[0]");
        _cast(b);
        vm.expectRevert(
            abi.encodeWithSelector(Election.AlreadyVoted.selector, bytes32(b.nullifier))
        );
        _cast(b);
    }

    function test_castVote_rejectsAChangedChoice() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        Ballot memory b = _ballot(".ballots[0]");
        b.choice = 2;
        vm.expectRevert(SemaphoreElection.InvalidProof.selector);
        _cast(b);
    }

    function test_castVote_rejectsABallotForAnotherElection() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        vm.expectRevert(SemaphoreElection.InvalidProof.selector);
        _cast(_ballot(".foreign"));
    }

    function test_castVote_rejectsAProofAgainstAnotherRoot() public {
        _openVoting(TallyLib.CountingRule.Plurality, keccak256("another list") >> 8, _count());
        vm.expectRevert(SemaphoreElection.InvalidProof.selector);
        _cast(_ballot(".ballots[0]"));
    }

    function test_castVote_rejectsATamperedProof() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        Ballot memory b = _ballot(".ballots[0]");
        b.points[7] = b.points[7] ^ 1;
        vm.expectRevert(SemaphoreElection.InvalidProof.selector);
        _cast(b);
    }

    function test_castVote_rejectsAProofAtTheWrongDepth() public {
        // The same root with a smaller voter count implies a shallower tree, so the verification
        // key no longer matches the proof.
        _openVoting(TallyLib.CountingRule.Plurality, _root(), 512);
        vm.expectRevert(SemaphoreElection.InvalidProof.selector);
        _cast(_ballot(".ballots[0]"));
    }

    function test_castVote_onlyWhileVotingIsOpen() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        vm.warp(schedule.votingEnd);
        Ballot memory b = _ballot(".ballots[0]");
        vm.expectRevert(Election.VotingClosed.selector);
        _cast(b);
    }

    function test_castVote_approvalBallotCountsEachApprovedCandidate() public {
        _openVoting(TallyLib.CountingRule.Approval, _root(), _count());
        _cast(_ballot(".approval"));
        uint256[] memory tally = election.tally();
        assertEq(tally[0], 1);
        assertEq(tally[1], 0);
        assertEq(tally[2], 1);
    }

    function test_castVote_aOneVoterElection() public {
        bytes32 root = vm.parseJsonBytes32(fixture, ".single.root");
        _openVoting(TallyLib.CountingRule.Plurality, root, 1);
        assertEq(election.merkleTreeDepth(), 1);
        _cast(_ballot(".single.ballot"));
        assertEq(election.tally()[0], 1);
    }

    // -------------------------------------------------------------------------------------------
    // Ballots submitted by someone else
    // -------------------------------------------------------------------------------------------

    function test_castVote_anyAccountMaySubmitABallot() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        Ballot memory b = _ballot(".ballots[0]");
        vm.prank(relayer);
        _cast(b);
        assertEq(election.tally()[b.choice], 1);
        assertTrue(election.ballotKeyUsed(bytes32(b.nullifier)));
    }

    function test_castVote_anotherAccountCannotReplayACountedBallot() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        Ballot memory b = _ballot(".ballots[0]");
        vm.prank(relayer);
        _cast(b);
        // A different sender with the same proof is stopped by the nullifier alone.
        vm.prank(makeAddr("someone else"));
        vm.expectRevert(
            abi.encodeWithSelector(Election.AlreadyVoted.selector, bytes32(b.nullifier))
        );
        _cast(b);
        assertEq(election.ballotsCast(), 1);
    }

    // -------------------------------------------------------------------------------------------
    // Configuration
    // -------------------------------------------------------------------------------------------

    function test_merkleTreeDepth_followsTheVoterCount() public {
        uint256[7] memory counts = [uint256(1), 2, 3, 4, 5, 1024, 1025];
        uint256[7] memory depths = [uint256(1), 1, 2, 2, 3, 10, 11];
        for (uint256 i; i < counts.length; ++i) {
            _openVoting(TallyLib.CountingRule.Plurality, bytes32(uint256(1)), counts[i]);
            assertEq(election.merkleTreeDepth(), depths[i]);
        }
    }

    function testFuzz_merkleTreeDepth_isTheSmallestDepthThatFitsTheList(uint32 count) public {
        count = uint32(bound(count, 1, type(uint32).max));
        _openVoting(TallyLib.CountingRule.Plurality, bytes32(uint256(1)), count);
        uint256 depth = election.merkleTreeDepth();
        assertGe(depth, 1);
        assertGe(uint256(1) << depth, count);
        if (depth > 1) assertLt(uint256(1) << (depth - 1), count);
    }

    function test_tierAndScope() public {
        _openVoting(TallyLib.CountingRule.Plurality, _root(), _count());
        assertEq(election.tier(), 3);
        assertEq(election.scope(), uint256(uint160(address(election))));
    }

    function test_constructor_rejectsAZeroVerifier() public {
        vm.expectRevert(Election.ZeroAddress.selector);
        new SemaphoreElection(ISemaphoreVerifier(address(0)));
    }

    // -------------------------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------------------------

    /// @dev Puts a fresh clone at the fixture's election address, which the proofs are bound to,
    /// and takes it to the voting phase with the given voter list.
    function _openVoting(TallyLib.CountingRule rule, bytes32 root, uint256 count) internal {
        address at = vm.parseJsonAddress(fixture, ".election");
        vm.etch(at, Clones.clone(address(implementation)).code);
        vm.store(
            at,
            bytes32(uint256(0xf0c57e16840df040f15088dc2f81fe391c3923bec73e23a9662efc9c229c6a00)),
            0
        );
        election = SemaphoreElection(at);
        _resetStorage(at);
        uint64 t = uint64(block.timestamp);
        schedule = Election.Schedule(t + 100, t + 200, t + 300, t + 400);
        Election.Candidate[] memory candidates = new Election.Candidate[](3);
        candidates[0] = Election.Candidate("Aarav", "");
        candidates[1] = Election.Candidate("Diya", "");
        candidates[2] = Election.Candidate("Kabir", "");
        election.initialize(
            Election.Setup(authority, registrar, rule), "Senate", "", schedule, candidates
        );

        vm.warp(schedule.registrationStart);
        election.openRegistration();
        vm.warp(schedule.registrationEnd);
        vm.prank(registrar);
        election.publishVoterList(root, count, "bafy-identity-list");
        vm.warp(schedule.votingStart);
        election.openVoting();
    }

    /// @dev A reused address keeps the storage of a previous election, so it is wiped first.
    function _resetStorage(address at) internal {
        for (uint256 slot; slot < 32; ++slot) {
            vm.store(at, bytes32(slot), bytes32(0));
        }
    }

    function _cast(Ballot memory b) internal {
        election.castVote(b.choice, b.nullifier, b.points);
    }

    function _ballot(string memory path) internal view returns (Ballot memory b) {
        b.choice = vm.parseJsonUint(fixture, string.concat(path, ".choice"));
        b.nullifier = vm.parseJsonUint(fixture, string.concat(path, ".nullifier"));
        uint256[] memory points = vm.parseJsonUintArray(fixture, string.concat(path, ".points"));
        for (uint256 i; i < 8; ++i) {
            b.points[i] = points[i];
        }
    }

    function _root() internal view returns (bytes32) {
        return vm.parseJsonBytes32(fixture, ".root");
    }

    function _count() internal view returns (uint256) {
        return vm.parseJsonUint(fixture, ".voterCount");
    }
}
