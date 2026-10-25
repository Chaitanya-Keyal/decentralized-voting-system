// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TallyLib
/// @notice Counting rules, kept apart from the election lifecycle so that a new counting method
/// can be added without touching it.
library TallyLib {
    /// @notice Plurality: the candidates with the most votes.
    /// @dev Returns every candidate tied for the lead, and no winners when no votes were cast.
    /// @param tally Votes per candidate, indexed by candidate.
    /// @return winners Indexes of the winning candidates, in ascending order.
    function pluralityWinners(uint256[] memory tally)
        internal
        pure
        returns (uint256[] memory winners)
    {
        uint256 best = 0;
        uint256 leaders = 0;
        for (uint256 i; i < tally.length; ++i) {
            if (tally[i] > best) {
                best = tally[i];
                leaders = 1;
            } else if (tally[i] == best && best != 0) {
                ++leaders;
            }
        }

        winners = new uint256[](leaders);
        if (leaders == 0) return winners;

        uint256 next = 0;
        for (uint256 i; i < tally.length; ++i) {
            if (tally[i] == best) winners[next++] = i;
        }
    }
}
