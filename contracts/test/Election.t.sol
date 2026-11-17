// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {Test} from "forge-std/Test.sol";

import {Election} from "../src/Election.sol";
import {TallyLib} from "../src/TallyLib.sol";
import {VoterRegistry} from "../src/VoterRegistry.sol";

/// @dev Exposes ballot recording so the shared lifecycle can be tested without a voting tier.
contract ElectionHarness is Election {
    function tier() external pure override returns (uint8) {
        return 0;
    }

    function recordBallot(bytes32 key, uint256 candidate) external {
        _requireVotingOpen();
        _recordBallot(key, candidate);
    }
}

contract ElectionTest is Test {
    ElectionHarness internal election;
    Election.Schedule internal schedule;

    address internal authority = makeAddr("authority");
    address internal registrar = makeAddr("registrar");
    address internal anyone = makeAddr("anyone");

    bytes32 internal constant ROOT = keccak256("root");
    string internal constant LIST_CID = "bafy-voter-list";

    function setUp() public {
        ElectionHarness implementation = new ElectionHarness();
        election = ElectionHarness(Clones.clone(address(implementation)));

        uint64 t = uint64(block.timestamp);
        schedule = Election.Schedule(t + 100, t + 200, t + 300, t + 400);
        election.initialize(
            Election.Setup(authority, registrar, TallyLib.CountingRule.Plurality),
            "Senate",
            "bafy-ballot",
            schedule,
            _candidates(3)
        );
    }

    // -------------------------------------------------------------------------------------------
    // Setup
    // -------------------------------------------------------------------------------------------

    function test_initialize_setsRolesConfigAndCandidates() public view {
        assertTrue(election.hasRole(election.AUTHORITY_ROLE(), authority));
        assertTrue(election.hasRole(election.REGISTRAR_ROLE(), registrar));
        assertEq(election.title(), "Senate");
        assertEq(election.metadataCid(), "bafy-ballot");
        assertEq(election.candidates().length, 3);
        assertEq(election.candidates()[1].name, "Candidate 1");
        assertEq(uint8(election.phase()), uint8(Election.Phase.Created));
    }

    function test_initialize_onlyOnce() public {
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        election.initialize(
            Election.Setup(anyone, anyone, TallyLib.CountingRule.Plurality),
            "Again",
            "",
            schedule,
            _candidates(2)
        );
    }

    function test_implementation_cannotBeInitialized() public {
        ElectionHarness implementation = new ElectionHarness();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        implementation.initialize(
            Election.Setup(authority, registrar, TallyLib.CountingRule.Plurality),
            "Senate",
            "",
            schedule,
            _candidates(2)
        );
    }

    function test_initialize_rejectsZeroAddresses() public {
        ElectionHarness fresh = _freshClone();
        vm.expectRevert(Election.ZeroAddress.selector);
        fresh.initialize(
            Election.Setup(address(0), registrar, TallyLib.CountingRule.Plurality),
            "Senate",
            "",
            schedule,
            _candidates(2)
        );
        vm.expectRevert(Election.ZeroAddress.selector);
        fresh.initialize(
            Election.Setup(authority, address(0), TallyLib.CountingRule.Plurality),
            "Senate",
            "",
            schedule,
            _candidates(2)
        );
    }

    function test_roles_cannotBeChangedByAnyone() public {
        // Nobody holds the admin role, so the authority and the registrar are fixed for good.
        bytes32 admin = election.DEFAULT_ADMIN_ROLE();
        bytes32 authorityRole = election.AUTHORITY_ROLE();
        bytes32 registrarRole = election.REGISTRAR_ROLE();
        assertFalse(election.hasRole(admin, authority));
        assertFalse(election.hasRole(admin, registrar));
        assertFalse(election.hasRole(admin, address(this)));

        vm.expectRevert(_unauthorized(authority, admin));
        vm.prank(authority);
        election.grantRole(registrarRole, anyone);

        vm.expectRevert(_unauthorized(registrar, admin));
        vm.prank(registrar);
        election.grantRole(authorityRole, anyone);

        vm.expectRevert(_unauthorized(authority, admin));
        vm.prank(authority);
        election.revokeRole(registrarRole, registrar);
    }

    // -------------------------------------------------------------------------------------------
    // Authority: configuration, candidates, cancellation
    // -------------------------------------------------------------------------------------------

    function test_configure_byAuthorityBeforeRegistration() public {
        Election.Schedule memory later = Election.Schedule(500, 600, 700, 800);
        vm.prank(authority);
        election.configure("Senate 2026", "bafy-new", later);
        assertEq(election.title(), "Senate 2026");
        (,,, uint64 votingEnd) = election.schedule();
        assertEq(votingEnd, 800);
    }

    function test_configure_onlyAuthority() public {
        vm.expectRevert(_unauthorized(anyone, election.AUTHORITY_ROLE()));
        vm.prank(anyone);
        election.configure("Senate", "", schedule);
    }

    function test_configure_notAfterRegistrationOpens() public {
        _toRegistration();
        vm.expectRevert(
            abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Registration)
        );
        vm.prank(authority);
        election.configure("Senate", "", schedule);
    }

    function test_configure_notOnceRegistrationIsDue() public {
        // Registration is open from its start time, even before anyone records that on-chain.
        vm.warp(schedule.registrationStart);
        vm.expectRevert(
            abi.encodeWithSelector(Election.TooLate.selector, schedule.registrationStart)
        );
        vm.prank(authority);
        election.configure("Senate", "", Election.Schedule(500, 600, 700, 800));
    }

    function test_configure_rejectsBadScheduleAndTitle() public {
        vm.startPrank(authority);
        vm.expectRevert(Election.InvalidSchedule.selector);
        election.configure("Senate", "", Election.Schedule(10, 10, 20, 30));
        vm.expectRevert(Election.InvalidSchedule.selector);
        election.configure("Senate", "", Election.Schedule(10, 20, 20, 30));
        vm.expectRevert(Election.InvalidSchedule.selector);
        election.configure("Senate", "", Election.Schedule(10, 20, 30, 30));
        vm.expectRevert(Election.InvalidTitle.selector);
        election.configure("", "", schedule);
        vm.stopPrank();
    }

    function test_setCandidates_allowedUntilVotingOpens() public {
        vm.prank(authority);
        election.setCandidates(_candidates(2));
        assertEq(election.candidates().length, 2);

        _toRegistration();
        vm.prank(authority);
        election.setCandidates(_candidates(4));
        assertEq(election.candidates().length, 4);

        _publish(1);
        _toVoting();
        vm.expectRevert(abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Voting));
        vm.prank(authority);
        election.setCandidates(_candidates(2));
    }

    function test_setCandidates_notOnceVotingIsDue() public {
        _toRegistration();
        _publish(1);
        vm.warp(schedule.votingStart);
        vm.expectRevert(abi.encodeWithSelector(Election.TooLate.selector, schedule.votingStart));
        vm.prank(authority);
        election.setCandidates(_candidates(2));
    }

    function test_setCandidates_rejectsEmptyTooManyOrUnnamed() public {
        vm.startPrank(authority);
        vm.expectRevert(Election.InvalidCandidates.selector);
        election.setCandidates(new Election.Candidate[](0));

        uint256 tooMany = election.MAX_CANDIDATES() + 1;
        vm.expectRevert(Election.InvalidCandidates.selector);
        election.setCandidates(_candidates(tooMany));

        Election.Candidate[] memory unnamed = _candidates(2);
        unnamed[1].name = "";
        vm.expectRevert(Election.InvalidCandidates.selector);
        election.setCandidates(unnamed);
        vm.stopPrank();
    }

    function test_cancel_byAuthorityBeforeVoting() public {
        _toRegistration();
        vm.prank(authority);
        election.cancel();
        assertEq(uint8(election.phase()), uint8(Election.Phase.Cancelled));
    }

    function test_cancel_notOnceVotingOpens() public {
        _toRegistration();
        _publish(1);
        _toVoting();
        vm.expectRevert(abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Voting));
        vm.prank(authority);
        election.cancel();
    }

    function test_cancel_notOnceListIsOutAndVotingIsDue() public {
        _toRegistration();
        _publish(1);
        vm.warp(schedule.votingStart);
        vm.expectRevert(abi.encodeWithSelector(Election.TooLate.selector, schedule.votingStart));
        vm.prank(authority);
        election.cancel();
    }

    function test_cancel_electionWhoseListNeverAppeared() public {
        _toRegistration();
        vm.warp(schedule.votingEnd);
        vm.prank(authority);
        election.cancel();
        assertEq(uint8(election.phase()), uint8(Election.Phase.Cancelled));
    }

    function test_cancel_electionWhoseVotingNeverOpened() public {
        _toRegistration();
        _publish(1);
        vm.warp(schedule.votingEnd);
        vm.prank(authority);
        election.cancel();
        assertEq(uint8(election.phase()), uint8(Election.Phase.Cancelled));
    }

    function test_cancel_afterPublicationUntilVotingIsDue() public {
        _toRegistration();
        _publish(1);
        vm.warp(schedule.votingStart - 1);
        vm.prank(authority);
        election.cancel();
        assertEq(uint8(election.phase()), uint8(Election.Phase.Cancelled));
    }

    function test_cancel_onlyAuthority() public {
        vm.expectRevert(_unauthorized(registrar, election.AUTHORITY_ROLE()));
        vm.prank(registrar);
        election.cancel();
    }

    function test_cancelled_electionCannotOpen() public {
        vm.prank(authority);
        election.cancel();
        vm.warp(schedule.registrationStart);
        vm.expectRevert(
            abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Cancelled)
        );
        election.openRegistration();
    }

    // -------------------------------------------------------------------------------------------
    // Registrar: publishing the voter list
    // -------------------------------------------------------------------------------------------

    function test_publishVoterList_onceRegistrationCloses() public {
        _toRegistration();
        vm.warp(schedule.registrationEnd);
        vm.expectEmit(address(election));
        emit VoterRegistry.VoterRootPublished(ROOT, 5, LIST_CID);
        vm.prank(registrar);
        election.publishVoterList(ROOT, 5, LIST_CID);

        assertEq(election.voterRoot(), ROOT);
        assertEq(election.voterCount(), 5);
        assertEq(election.voterListCid(), LIST_CID);
    }

    function test_publishVoterList_notBeforeRegistrationCloses() public {
        _toRegistration();
        vm.expectRevert(
            abi.encodeWithSelector(Election.TooEarly.selector, schedule.registrationEnd)
        );
        vm.prank(registrar);
        election.publishVoterList(ROOT, 5, LIST_CID);
    }

    function test_publishVoterList_onlyBeforeVotingIsDue() public {
        // Voters need time to check the list before the vote, so a late list is refused.
        _toRegistration();
        vm.warp(schedule.votingStart);
        vm.expectRevert(abi.encodeWithSelector(Election.TooLate.selector, schedule.votingStart));
        vm.prank(registrar);
        election.publishVoterList(ROOT, 5, LIST_CID);

        vm.warp(schedule.votingStart - 1);
        vm.prank(registrar);
        election.publishVoterList(ROOT, 5, LIST_CID);
        assertTrue(election.isVoterListPublished());
    }

    function test_publishVoterList_onlyRegistrar() public {
        _toRegistration();
        vm.warp(schedule.registrationEnd);
        vm.expectRevert(_unauthorized(authority, election.REGISTRAR_ROLE()));
        vm.prank(authority);
        election.publishVoterList(ROOT, 5, LIST_CID);
    }

    function test_publishVoterList_isFrozenAfterwards() public {
        _toRegistration();
        _publish(5);
        vm.expectRevert(VoterRegistry.VoterListAlreadyPublished.selector);
        vm.prank(registrar);
        election.publishVoterList(keccak256("other"), 6, "bafy-other");
    }

    function test_publishVoterList_rejectsEmptyValues() public {
        _toRegistration();
        vm.warp(schedule.registrationEnd);
        vm.startPrank(registrar);
        vm.expectRevert(VoterRegistry.InvalidVoterList.selector);
        election.publishVoterList(bytes32(0), 5, LIST_CID);
        vm.expectRevert(VoterRegistry.InvalidVoterList.selector);
        election.publishVoterList(ROOT, 0, LIST_CID);
        vm.expectRevert(VoterRegistry.InvalidVoterList.selector);
        election.publishVoterList(ROOT, 5, "");
        vm.stopPrank();
    }

    // -------------------------------------------------------------------------------------------
    // Phase changes
    // -------------------------------------------------------------------------------------------

    function test_openRegistration_byAnyoneOnceItsTimeComes() public {
        vm.expectRevert(
            abi.encodeWithSelector(Election.TooEarly.selector, schedule.registrationStart)
        );
        election.openRegistration();

        vm.warp(schedule.registrationStart);
        vm.expectEmit(address(election));
        emit Election.PhaseChanged(Election.Phase.Created, Election.Phase.Registration);
        vm.prank(anyone);
        election.openRegistration();
    }

    function test_openVoting_requiresPublishedList() public {
        _toRegistration();
        vm.warp(schedule.votingStart);
        vm.expectRevert(Election.VoterListNotPublished.selector);
        election.openVoting();
    }

    function test_openVoting_notBeforeItsTime() public {
        _toRegistration();
        _publish(5);
        vm.expectRevert(abi.encodeWithSelector(Election.TooEarly.selector, schedule.votingStart));
        election.openVoting();
    }

    function test_openVoting_notAfterVotingCloses() public {
        _toRegistration();
        _publish(5);
        vm.warp(schedule.votingEnd);
        vm.expectRevert(abi.encodeWithSelector(Election.TooLate.selector, schedule.votingEnd));
        election.openVoting();
    }

    function test_closeVotingAndFinalize_byAnyone() public {
        _toRegistration();
        _publish(5);
        _toVoting();
        election.recordBallot(bytes32(uint256(1)), 2);

        vm.expectRevert(abi.encodeWithSelector(Election.TooEarly.selector, schedule.votingEnd));
        election.closeVoting();

        vm.warp(schedule.votingEnd);
        vm.prank(anyone);
        election.closeVoting();
        vm.prank(anyone);
        election.finalize();

        assertEq(uint8(election.phase()), uint8(Election.Phase.Finalized));
        assertEq(election.winners().length, 1);
        assertEq(election.winners()[0], 2);
    }

    function test_finalize_onlyAfterVotingCloses() public {
        _toRegistration();
        _publish(5);
        _toVoting();
        vm.expectRevert(abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Voting));
        election.finalize();
    }

    function test_finalize_emitsTheResult() public {
        _toRegistration();
        _publish(5);
        _toVoting();
        election.recordBallot(bytes32(uint256(1)), 0);
        election.recordBallot(bytes32(uint256(2)), 2);
        election.recordBallot(bytes32(uint256(3)), 2);
        vm.warp(schedule.votingEnd);
        election.closeVoting();

        uint256[] memory tally = new uint256[](3);
        tally[0] = 1;
        tally[2] = 2;
        uint256[] memory winners = new uint256[](1);
        winners[0] = 2;
        vm.expectEmit(address(election));
        emit Election.Finalized(tally, winners);
        election.finalize();
    }

    function test_finalize_withNoBallotsHasNoWinner() public {
        _toRegistration();
        _publish(5);
        _toVoting();
        vm.warp(schedule.votingEnd);
        election.closeVoting();
        election.finalize();

        assertEq(uint8(election.phase()), uint8(Election.Phase.Finalized));
        assertEq(election.tally().length, 3);
        assertEq(election.winners().length, 0);
    }

    function test_finalize_resultIsPermanent() public {
        _toRegistration();
        _publish(5);
        _toVoting();
        election.recordBallot(bytes32(uint256(1)), 1);
        vm.warp(schedule.votingEnd);
        election.closeVoting();
        election.finalize();

        // Every function that changes state refuses to run on a finalized election (FR8).
        bytes memory finalized =
            abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Finalized);
        vm.expectRevert(finalized);
        election.finalize();
        vm.expectRevert(finalized);
        election.closeVoting();
        vm.expectRevert(finalized);
        election.openVoting();
        vm.expectRevert(finalized);
        election.openRegistration();
        vm.expectRevert(finalized);
        election.recordBallot(bytes32(uint256(2)), 1);
        vm.startPrank(authority);
        vm.expectRevert(finalized);
        election.cancel();
        vm.expectRevert(finalized);
        election.setCandidates(_candidates(2));
        vm.expectRevert(finalized);
        election.configure("Senate", "", schedule);
        vm.stopPrank();
        vm.expectRevert(finalized);
        vm.prank(registrar);
        election.publishVoterList(keccak256("other"), 6, "bafy-other");

        assertEq(uint8(election.phase()), uint8(Election.Phase.Finalized));
        assertEq(election.tally()[1], 1);
        assertEq(election.winners().length, 1);
        assertEq(election.winners()[0], 1);
        assertEq(election.voterRoot(), ROOT);
    }

    function test_phases_neverGoBack() public {
        _toRegistration();
        vm.expectRevert(
            abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Registration)
        );
        election.openRegistration();

        _publish(5);
        _toVoting();
        vm.warp(schedule.votingEnd);
        election.closeVoting();
        vm.expectRevert(
            abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Tallying)
        );
        election.openVoting();
    }

    // -------------------------------------------------------------------------------------------
    // Ballots
    // -------------------------------------------------------------------------------------------

    function test_recordBallot_updatesTally() public {
        _toRegistration();
        _publish(5);
        _toVoting();
        election.recordBallot(bytes32(uint256(1)), 0);
        election.recordBallot(bytes32(uint256(2)), 2);
        election.recordBallot(bytes32(uint256(3)), 2);

        uint256[] memory counts = election.tally();
        assertEq(counts[0], 1);
        assertEq(counts[1], 0);
        assertEq(counts[2], 2);
        assertEq(election.ballotsCast(), 3);
        assertTrue(election.ballotKeyUsed(bytes32(uint256(2))));
    }

    function test_recordBallot_rejectsSecondBallotFromSameKey() public {
        _toRegistration();
        _publish(5);
        _toVoting();
        bytes32 key = bytes32(uint256(7));
        election.recordBallot(key, 0);
        vm.expectRevert(abi.encodeWithSelector(Election.AlreadyVoted.selector, key));
        election.recordBallot(key, 1);
    }

    function test_recordBallot_rejectsInvalidChoice() public {
        _toRegistration();
        _publish(5);
        _toVoting();
        vm.expectRevert(abi.encodeWithSelector(Election.InvalidChoice.selector, 3));
        election.recordBallot(bytes32(uint256(1)), 3);
    }

    function test_recordBallot_cappedAtVoterCount() public {
        _toRegistration();
        _publish(2);
        _toVoting();
        election.recordBallot(bytes32(uint256(1)), 0);
        election.recordBallot(bytes32(uint256(2)), 0);
        vm.expectRevert(Election.BallotCapReached.selector);
        election.recordBallot(bytes32(uint256(3)), 0);
    }

    function test_recordBallot_onlyWhileVotingIsOpen() public {
        _toRegistration();
        _publish(5);
        vm.expectRevert(
            abi.encodeWithSelector(Election.WrongPhase.selector, Election.Phase.Registration)
        );
        election.recordBallot(bytes32(uint256(1)), 0);

        _toVoting();
        vm.warp(schedule.votingEnd - 1);
        election.recordBallot(bytes32(uint256(1)), 0);
        vm.warp(schedule.votingEnd);
        vm.expectRevert(Election.VotingClosed.selector);
        election.recordBallot(bytes32(uint256(2)), 0);
    }

    function testFuzz_recordBallot_eachKeyVotesOnce(bytes32 key, uint8 candidate) public {
        candidate = uint8(bound(candidate, 0, 2));
        _toRegistration();
        _publish(5);
        _toVoting();
        election.recordBallot(key, candidate);
        vm.expectRevert(abi.encodeWithSelector(Election.AlreadyVoted.selector, key));
        election.recordBallot(key, candidate);
        assertEq(election.ballotsCast(), 1);
    }

    // -------------------------------------------------------------------------------------------
    // Approval voting
    // -------------------------------------------------------------------------------------------

    function test_countingRule_isFixedAtCreation() public view {
        assertEq(uint8(election.countingRule()), uint8(TallyLib.CountingRule.Plurality));
    }

    function test_approval_countsEveryApprovedCandidate() public {
        election = _approvalElection();
        _toRegistration();
        _publish(5);
        _toVoting();
        // Bitmasks: 5 approves candidates 0 and 2, 3 approves 0 and 1, 4 approves 2 alone.
        election.recordBallot(bytes32(uint256(1)), 5);
        election.recordBallot(bytes32(uint256(2)), 3);
        election.recordBallot(bytes32(uint256(3)), 4);
        uint256[] memory counts = election.tally();
        assertEq(counts[0], 2);
        assertEq(counts[1], 1);
        assertEq(counts[2], 2);
        assertEq(election.ballotsCast(), 3);

        vm.warp(schedule.votingEnd);
        election.closeVoting();
        election.finalize();
        assertEq(election.winners().length, 2);
        assertEq(election.winners()[0], 0);
        assertEq(election.winners()[1], 2);
    }

    function test_approval_rejectsAnEmptyBallotAndUnknownCandidates() public {
        election = _approvalElection();
        _toRegistration();
        _publish(5);
        _toVoting();
        vm.expectRevert(abi.encodeWithSelector(Election.InvalidChoice.selector, 0));
        election.recordBallot(bytes32(uint256(1)), 0);
        // 8 would approve a fourth candidate, which does not exist.
        vm.expectRevert(abi.encodeWithSelector(Election.InvalidChoice.selector, 8));
        election.recordBallot(bytes32(uint256(1)), 8);
        election.recordBallot(bytes32(uint256(1)), 7);
        assertEq(election.ballotsCast(), 1);
    }

    function test_singleCandidateElection() public {
        ElectionHarness fresh = _freshClone();
        fresh.initialize(
            Election.Setup(authority, registrar, TallyLib.CountingRule.Plurality),
            "Referendum",
            "",
            schedule,
            _candidates(1)
        );
        election = fresh;
        _toRegistration();
        _publish(1);
        _toVoting();
        election.recordBallot(bytes32(uint256(1)), 0);
        vm.warp(schedule.votingEnd);
        election.closeVoting();
        election.finalize();
        assertEq(election.winners().length, 1);
        assertEq(election.winners()[0], 0);
    }

    // -------------------------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------------------------

    function _toRegistration() internal {
        vm.warp(schedule.registrationStart);
        election.openRegistration();
    }

    function _publish(uint256 count) internal {
        vm.warp(schedule.registrationEnd);
        vm.prank(registrar);
        election.publishVoterList(ROOT, count, LIST_CID);
    }

    function _toVoting() internal {
        vm.warp(schedule.votingStart);
        election.openVoting();
    }

    function _approvalElection() internal returns (ElectionHarness fresh) {
        fresh = _freshClone();
        fresh.initialize(
            Election.Setup(authority, registrar, TallyLib.CountingRule.Approval),
            "Committee",
            "",
            schedule,
            _candidates(3)
        );
    }

    function _freshClone() internal returns (ElectionHarness) {
        return ElectionHarness(Clones.clone(address(new ElectionHarness())));
    }

    function _candidates(uint256 n) internal pure returns (Election.Candidate[] memory list) {
        list = new Election.Candidate[](n);
        for (uint256 i; i < n; ++i) {
            list[i] = Election.Candidate(string.concat("Candidate ", vm.toString(i)), "");
        }
    }

    function _unauthorized(address account, bytes32 role) internal pure returns (bytes memory) {
        return abi.encodeWithSelector(
            IAccessControl.AccessControlUnauthorizedAccount.selector, account, role
        );
    }
}
