// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SemaphoreVerifier} from "@semaphore-protocol/contracts/base/SemaphoreVerifier.sol";
import {ISemaphoreVerifier} from "@semaphore-protocol/contracts/interfaces/ISemaphoreVerifier.sol";
import {Script} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";

import {ElectionFactory} from "../src/ElectionFactory.sol";
import {MerkleElection} from "../src/MerkleElection.sol";
import {SemaphoreElection} from "../src/SemaphoreElection.sol";
import {VoteForwarder} from "../src/VoteForwarder.sol";

/// @notice Deploys both tiers: the tier 2 election and its factory, and the tier 3 election with
/// Semaphore's verifier, the vote forwarder and its own factory. Records the addresses in
/// `deployments/<chain id>.json`. A dry run, without `--broadcast`, records nothing.
/// @dev Locally, start a fresh `anvil` and run `pnpm deploy:local`. On a fresh chain the addresses
/// are always the same, because they depend only on the deployer and its nonce. On Sepolia, set
/// DEPLOYER_PRIVATE_KEY and SEPOLIA_RPC_URL and run `pnpm deploy:sepolia`, which also publishes the
/// source to Sourcify so anyone can check the deployed bytecode against it. Sepolia runs Glamsterdam,
/// whose EIP-8037 charges far more gas to create state than Foundry's local EVM does, so the
/// Sepolia deploy skips the local simulation and takes its gas limits from the node.
contract Deploy is Script {
    function run() external {
        uint256 startBlock = block.number;

        // On a testnet the deployer's key comes from the environment, never the command line;
        // locally, Anvil's unlocked account is passed with --unlocked --sender.
        uint256 deployerKey = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (deployerKey != 0) vm.startBroadcast(deployerKey);
        else vm.startBroadcast();
        MerkleElection merkleElection = new MerkleElection();
        ElectionFactory electionFactory = new ElectionFactory(address(merkleElection));
        SemaphoreVerifier verifier = new SemaphoreVerifier();
        VoteForwarder forwarder = new VoteForwarder();
        SemaphoreElection semaphoreElection =
            new SemaphoreElection(ISemaphoreVerifier(address(verifier)), address(forwarder));
        ElectionFactory semaphoreFactory = new ElectionFactory(address(semaphoreElection));
        vm.stopBroadcast();

        // A dry run deploys nothing, so its addresses must not replace the real ones.
        bool deployed = vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)
            || vm.isContext(VmSafe.ForgeContext.ScriptResume);
        if (!deployed) return;

        string memory key = "deployment";
        vm.serializeUint(key, "chainId", block.chainid);
        vm.serializeUint(key, "startBlock", startBlock);
        vm.serializeAddress(key, "merkleElection", address(merkleElection));
        vm.serializeAddress(key, "electionFactory", address(electionFactory));
        vm.serializeAddress(key, "semaphoreVerifier", address(verifier));
        vm.serializeAddress(key, "voteForwarder", address(forwarder));
        vm.serializeAddress(key, "semaphoreElection", address(semaphoreElection));
        string memory json = vm.serializeAddress(key, "semaphoreFactory", address(semaphoreFactory));
        vm.writeJson(
            json,
            string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json")
        );
    }
}
