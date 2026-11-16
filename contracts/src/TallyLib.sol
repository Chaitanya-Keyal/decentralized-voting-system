// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TallyLib
/// @notice Counting rules, kept apart from the election lifecycle so that a new counting method
/// can be added without touching it.
library TallyLib {
    /// @notice How ballots are counted. Fixed when the election is created, before any ballot.
    /// Plurality: a ballot names one candidate. Approval: a ballot approves any non-empty set of
    /// candidates, and each approval counts as one vote for that candidate.
    enum CountingRule {
        Plurality,
        Approval
    }

    /// @notice Whether `choice` is a valid ballot among `candidates` candidates under `rule`.
    /// Plurality: a candidate index. Approval: a bitmask with bit `i` set for each approved
    /// candidate `i`, at least one bit set and none beyond the last candidate.
    function isValidChoice(CountingRule rule, uint256 candidates, uint256 choice)
        internal
        pure
        returns (bool)
    {
        if (rule == CountingRule.Plurality) return choice < candidates;
        return choice != 0 && (candidates >= 256 || choice >> candidates == 0);
    }

    /// @notice Adds one valid ballot to the tally.
    function count(uint256[] storage tally, CountingRule rule, uint256 choice) internal {
        if (rule == CountingRule.Plurality) {
            ++tally[choice];
            return;
        }
        uint256 candidates = tally.length;
        for (uint256 i; i < candidates; ++i) {
            if ((choice >> i) & 1 == 1) ++tally[i];
        }
    }

    /// @notice The candidates with the most votes: under approval, the most approvals.
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
