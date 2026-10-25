// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {ElectionFactory} from "../src/ElectionFactory.sol";
import {MerkleElection} from "../src/MerkleElection.sol";

/// @notice Deploys the tier 2 election implementation and its factory, and records their
/// addresses in `deployments/<chain id>.json`. A dry run, without `--broadcast`, records nothing.
/// @dev Locally, start a fresh `anvil` and run `pnpm deploy:local`. On a fresh chain the
/// addresses are always the same, because they depend only on the deployer and its nonce.
contract Deploy is Script {
    function run() external returns (ElectionFactory factory) {
        uint256 startBlock = block.number;

        vm.startBroadcast();
        MerkleElection implementation = new MerkleElection();
        factory = new ElectionFactory(address(implementation));
        vm.stopBroadcast();

        // A dry run deploys nothing, so its addresses must not replace the real ones.
        bool deployed = vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)
            || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (!deployed) return factory;

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", startBlock);
        vm.serializeAddress(key, "merkleElection", address(implementation));
        string memory json = vm.serializeAddress(key, "electionFactory", address(factory));
        vm.writeJson(
            json,
            string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json")
        );
    }
}
