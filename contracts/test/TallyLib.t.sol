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

    function _tally(uint256 a, uint256 b, uint256 c) internal pure returns (uint256[] memory t) {
        t = new uint256[](3);
        t[0] = a;
        t[1] = b;
        t[2] = c;
    }
}
