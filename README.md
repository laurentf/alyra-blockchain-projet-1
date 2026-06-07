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

---

## Choix de conception — `Voting.sol`

### Processus et rôles

- **Un déploiement = une élection.** Machine à états à sens unique ; le contrat terminé reste une archive immuable. Nouvelle élection → nouveau déploiement.
- **L'administrateur est soumis au processus.** Chaque transition exige l'état exact précédent (`onlyDuring`) : l'ordre des étapes est inviolable.
- **Aucun privilège de vote pour l'administrateur.** Il pilote les phases, mais ne propose et ne vote que s'il est inscrit sur la liste blanche, comme tout le monde.

### Sécurité et garde-fous

- **Garde-fous anti-blocage.** Fermer les propositions exige ≥ 1 proposition, fermer le vote exige ≥ 1 vote — vérifiés à la dernière étape où la situation est encore rattrapable ; plus tard, le contrat serait définitivement bloqué.
- **Dépouillement simple assumé.** `tallyVotes()` parcourt le tableau en O(n) : acceptable pour une petite organisation. Limite documentée : sans plafond de propositions, la boucle pourrait en théorie dépasser la limite de gas.
- **Ex aequo : antériorité.** À égalité, la proposition déposée en premier l'emporte (comparaison stricte `>`). Règle déterministe et publique ; l'égalité n'est pas signalée mais reste lisible dans les scores.
- **Propositions filtrées.** Longueur minimale (3 octets) et rejet des doublons exacts (empreinte keccak, O(1)). La normalisation (espaces, casse) relève de l'application cliente.
- **Limite héritée d'`Ownable`.** L'administrateur peut céder ou abandonner la propriété en cours d'élection, ce qui gèlerait les phases restantes — limite connue et documentée.
- **Dépendance unique : OpenZeppelin `Ownable` v5** (exigée par l'énoncé) — moins de code importé, moins de surface d'audit.

### Lisibilité et API

- **Erreurs typées uniquement.** Neuf erreurs avec arguments (`WrongWorkflowStatus(attendu, actuel)`, `AlreadyVoted(adresse)`...) : moins chères que les chaînes de caractères et plus précises pour l'appelant.
- **Contrôle d'accès dans les signatures.** `onlyVoters` et `onlyDuring(statut)` : qui peut appeler, et quand, se lit sur la première ligne de chaque fonction.
- **Lecture ouverte assumée.** `voters`, `proposals`, `winningProposalId`, `votesCount` sont publics : sur une blockchain publique, `private` ne cache rien — cohérent avec « le vote n'est pas secret ».
- **`getWinner()` fiable.** Renvoie à tout le monde la proposition gagnante complète (description + score) et échoue avant `VotesTallied` : impossible de lire un gagnant qui n'existe pas encore.
- **NatSpec complet** (généré avec assistance IA, relu et validé par l'auteur).

## Aller plus loin — `VotingPlus.sol`

Copie de `Voting.sol` enrichie d'ajouts ciblés — et de refus assumés, qui comptent autant.

### Ex aequo tranchés : élection caduque

- Le dépouillement détecte l'égalité (comptage des maximums dans la même boucle, toujours O(n)).
- En cas d'égalité : `hasWinner` reste `false` pour toujours, l'event `TieDetected(score, nombre d'ex aequo)` est émis, et `getWinner()` échoue avec `ElectionTied` — le contrat ne désigne **aucun** gagnant plutôt que d'en inventer un.
- Règle alignée sur la pratique des gouvernances on-chain (OpenZeppelin Governor exige `forVotes > againstVotes` : égalité = rejet) : **pas de majorité claire, pas d'action**. L'élection est caduque, on redéploie pour revoter.
- `hasWinner` est nommé pour que sa valeur par défaut soit honnête à tout moment : `false` se lit « pas (encore) de gagnant ».

### Administrateur immuable

- `transferOwnership()` et `renounceOwnership()` sont désactivés (`OwnershipLocked`) : « l'administrateur est celui qui a déployé » — pour toute la vie du contrat, par construction.
- L'élection ne peut être ni cédée ni rendue orpheline (un abandon en cours de route gèlerait définitivement les phases restantes — la limite documentée de `Voting.sol` est corrigée ici).
- Coût assumé : clé d'administrateur perdue = élection morte → redéploiement.

### Alternatives étudiées et écartées

- **Départage aléatoire** : pas de hasard fiable on-chain (les sources naïves — `timestamp`, `prevrandao` — sont influençables par le producteur du bloc) ; un oracle d'aléa vérifiable serait disproportionné ici.
- **Départage par l'administrateur** : un super-vote caché, contraire au principe « aucun privilège de vote pour l'administrateur ».
- **Second tour entre ex aequo** : démocratiquement séduisant, écarté pour son rapport complexité/bénéfice (nouveaux états, suivi des tours de vote, re-égalité possible à gérer).
- **`Pausable`** : un frein d'urgence donnerait à l'administrateur le pouvoir de geler une session de vote ouverte — pouvoir de censure refusé.
- **`Ownable2Step`** : sans objet une fois le transfert désactivé (le verrou est plus fort).
