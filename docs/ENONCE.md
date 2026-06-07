# Projet — Smart Contract de Vote

## Contexte

Un smart contract de vote peut être simple ou complexe, selon les exigences des élections que vous souhaitez soutenir. Le vote peut porter sur un petit nombre de propositions (ou de candidats) présélectionnées, ou sur un nombre potentiellement important de propositions suggérées de manière dynamique par les électeurs eux-mêmes.

Dans ce cadre, vous allez écrire un smart contract de vote pour une petite organisation. Les électeurs, que l'organisation connaît tous, sont inscrits sur une liste blanche (*whitelist*) grâce à leur adresse Ethereum. Ils peuvent soumettre de nouvelles propositions lors d'une session d'enregistrement des propositions, puis voter sur une proposition lors de la session de vote.

## Règles du vote

- ✔️ Le vote n'est **pas secret** pour les utilisateurs ajoutés à la whitelist.
- ✔️ Chaque électeur peut voir les votes des autres.
- ✔️ Le gagnant est déterminé à la **majorité simple**.
- ✔️ La proposition qui obtient le plus de voix l'emporte.
- ✔️ Le code doit inspirer la confiance et respecter les ordres déterminés.

## Le processus de vote

Voici le déroulement de l'ensemble du processus :

1. L'administrateur du vote enregistre une liste blanche d'électeurs identifiés par leur adresse Ethereum.
2. L'administrateur du vote commence la session d'enregistrement des propositions.
3. Les électeurs inscrits sont autorisés à enregistrer leurs propositions tant que la session d'enregistrement est active.
4. L'administrateur du vote met fin à la session d'enregistrement des propositions.
5. L'administrateur du vote commence la session de vote.
6. Les électeurs inscrits votent pour leur proposition préférée.
7. L'administrateur du vote met fin à la session de vote.
8. L'administrateur du vote comptabilise les votes.
9. Tout le monde peut vérifier les derniers détails de la proposition gagnante.

## Recommandations et exigences

- Le smart contract doit s'appeler **`Voting`**.
- Il doit utiliser la **dernière version** du compilateur.
- L'**administrateur** est celui qui va déployer le smart contract.
- Il doit définir les structures de données suivantes :

```solidity
struct Voter {
    bool isRegistered;
    bool hasVoted;
    uint votedProposalId;
}

struct Proposal {
    string description;
    uint voteCount;
}
```

- Il doit définir une énumération qui gère les différents états d'un vote :

```solidity
enum WorkflowStatus {
    RegisteringVoters,
    ProposalsRegistrationStarted,
    ProposalsRegistrationEnded,
    VotingSessionStarted,
    VotingSessionEnded,
    VotesTallied
}
```

- Il doit définir un `uint winningProposalId` qui représente l'id du gagnant, **ou** une fonction `getWinner` qui retourne le gagnant.
- Il doit importer la librairie [`Ownable`](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/access/Ownable.sol) d'OpenZeppelin.
- Il doit définir les événements suivants :

```solidity
event VoterRegistered(address voterAddress);
event WorkflowStatusChange(WorkflowStatus previousStatus, WorkflowStatus newStatus);
event ProposalRegistered(uint proposalId);
event Voted(address voter, uint proposalId);
```
