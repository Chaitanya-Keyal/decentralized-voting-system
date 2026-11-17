# Auditing an election

Anyone can check a DVote election's result without trusting us. Everything needed is public: the
contract's state and events on the chain, and the documents on IPFS that the contract names by
their content hash. This page explains how to check an election, and how to keep your own copy of
what it depends on.

## In the browser

Open the election's page and press **Run the audit**. Once the voter list is published, it:

1. fetches the published voter list from IPFS and rebuilds its Merkle root, which must equal the
   root recorded on-chain;
2. reads every ballot from the contract's events and checks that none repeats;
3. in an anonymous election, verifies every ballot's zero-knowledge proof against that root;
4. recounts the ballots and compares the totals with the contract's count;
5. checks that the winners follow from those totals.

The audit reads only the chain, through a public RPC endpoint, and IPFS. It makes no request to
DVote's API, so a dishonest or broken backend cannot change what it reports. To use an RPC
endpoint and IPFS gateway of your own choosing, run the web app yourself
([CONTRIBUTING.md](../CONTRIBUTING.md)) with `NEXT_PUBLIC_RPC_URL` and `NEXT_PUBLIC_IPFS_GATEWAY`
set to them.

## Keep your own copy of the voter list

The contract stores only the list's root, its size and its IPFS content identifier (CID). The
list itself lives on IPFS for as long as someone serves it. On Sepolia the registrar copies each
list it publishes, with the election's description and manifestos, to Pinata, a pinning service
that offers them to the whole IPFS network, so they do not depend on our server. If you may want
to audit the election later, keep a copy of your own as well.

1. Find the CID. The election page links to the list, or read it from the contract:

   ```sh
   cast call <election address> "voterListCid()(string)" --rpc-url <Sepolia RPC>
   ```

2. Pin it on your own IPFS node, which fetches it from the network and keeps serving it:

   ```sh
   ipfs pin add <cid>
   ```

3. Or save the file from any gateway, such as Pinata's public one, and check that it is the
   published one. A file whose CID matches cannot have been changed:

   ```sh
   curl -o voter-list.json https://gateway.pinata.cloud/ipfs/<cid>
   ipfs add --only-hash --cid-version=1 voter-list.json   # must print the same CID
   ```

Do the same for the election's description (`metadataCid`) and the candidates' manifestos if you
want them too.

## From the command line

`bench/src/d3.ts` checks a finished anonymous election on Sepolia from public data alone. It
rebuilds the list's root, verifies every ballot's proof against it, and reports what each ballot
reveals:

```sh
RPC_URL=<Sepolia RPC> IPFS_GATEWAY=<gateway> pnpm --filter @dvote/bench d3 <election address>
```

## What an audit cannot tell you

An audit shows that the count follows from the ballots and that every ballot came from someone on
the published list. It cannot show that the list holds only real, eligible people: that is the
registrar's responsibility, and the one thing DVote trusts it with. Comparing the list's size with
the number of people you know to be eligible is the check available to an outsider.
