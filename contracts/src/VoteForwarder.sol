// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC2771Forwarder} from "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

/// @title VoteForwarder
/// @notice Relays tier 3 ballots. The booth signs each ballot's call with a fresh throwaway key,
/// and the relayer submits it here and pays the gas, so a voter needs no ETH.
/// @dev A convenience, not a security control: a ballot's validity comes from its zero-knowledge
/// proof, which binds the choice and the election, so neither the relayer nor anyone else can
/// change a ballot, and anyone may submit one directly instead.
contract VoteForwarder is ERC2771Forwarder {
    constructor() ERC2771Forwarder("DVote VoteForwarder") {}
}
