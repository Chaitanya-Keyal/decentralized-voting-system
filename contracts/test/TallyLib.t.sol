// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";

import {TallyLib} from "../src/TallyLib.sol";

contract TallyLibTest is Test {
    function test_pluralityWinners_singleLeader() public pure {
        uint256[] memory winners = TallyLib.pluralityWinners(_tally(3, 7, 2));
        assertEq(winners.length, 1);
        assertEq(winners[0], 1);
    }

    function test_pluralityWinners_returnsEveryTiedLeader() public pure {
        uint256[] memory winners = TallyLib.pluralityWinners(_tally(5, 2, 5));
        assertEq(winners.length, 2);
        assertEq(winners[0], 0);
        assertEq(winners[1], 2);
    }

    function test_pluralityWinners_noVotesMeansNoWinner() public pure {
        assertEq(TallyLib.pluralityWinners(_tally(0, 0, 0)).length, 0);
        assertEq(TallyLib.pluralityWinners(new uint256[](0)).length, 0);
    }

    function testFuzz_pluralityWinners_haveTheMostVotes(uint256[8] memory counts) public pure {
        uint256[] memory tally = new uint256[](8);
        uint256 best;
        for (uint256 i; i < 8; ++i) {
            tally[i] = bound(counts[i], 0, 1_000_000);
            if (tally[i] > best) best = tally[i];
        }

        uint256[] memory winners = TallyLib.pluralityWinners(tally);
        if (best == 0) {
            assertEq(winners.length, 0);
            return;
        }
        uint256 expected;
        for (uint256 i; i < 8; ++i) {
            if (tally[i] == best) ++expected;
        }
        assertEq(winners.length, expected);
        for (uint256 i; i < winners.length; ++i) {
            assertEq(tally[winners[i]], best);
            // Strictly ascending, so no candidate is listed twice.
            if (i > 0) assertGt(winners[i], winners[i - 1]);
        }
    }

    function test_isValidChoice_pluralityTakesAnIndex() public pure {
        assertTrue(TallyLib.isValidChoice(TallyLib.CountingRule.Plurality, 3, 0));
        assertTrue(TallyLib.isValidChoice(TallyLib.CountingRule.Plurality, 3, 2));
        assertFalse(TallyLib.isValidChoice(TallyLib.CountingRule.Plurality, 3, 3));
    }

    function test_isValidChoice_approvalTakesANonEmptyBitmask() public pure {
        assertFalse(TallyLib.isValidChoice(TallyLib.CountingRule.Approval, 3, 0));
        assertTrue(TallyLib.isValidChoice(TallyLib.CountingRule.Approval, 3, 7));
        assertFalse(TallyLib.isValidChoice(TallyLib.CountingRule.Approval, 3, 8));
        assertTrue(TallyLib.isValidChoice(TallyLib.CountingRule.Approval, 64, type(uint64).max));
        assertFalse(TallyLib.isValidChoice(TallyLib.CountingRule.Approval, 64, 1 << 64));
    }

    uint256[] internal counted;

    function testFuzz_count_approvalAddsOnePerApprovedCandidate(uint64 mask, uint8 n) public {
        n = uint8(bound(n, 1, 64));
        uint256 choice = uint256(mask) & ((uint256(1) << n) - 1);
        vm.assume(choice != 0);
        delete counted;
        for (uint256 i; i < n; ++i) {
            counted.push(0);
        }
        TallyLib.count(counted, TallyLib.CountingRule.Approval, choice);
        uint256 total;
        for (uint256 i; i < n; ++i) {
            assertEq(counted[i], (choice >> i) & 1);
            total += counted[i];
        }
        assertGt(total, 0);
    }

    function _tally(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory t) {
        t = new uint256[](3);
        t[0] = a;
        t[1] = b;
        t[2] = c;
    }
}
