# Projet — Smart Contract de Vote

Smart contract de vote pour une petite organisation (formation Alyra) : liste blanche d'électeurs, soumission de propositions, session de vote puis dépouillement — le tout on-chain.

## 🌿 Deux branches, deux versions

| Branche | Ce qu'elle contient |
|---|---|
| **[`main`](../../tree/main)** | Le rendu **conforme à l'énoncé** : `Voting.sol` seul — déjà soigné (modifiers `onlyOwner`/`onlyVoters`/`onlyDuring`, custom errors, garde-fous anti-blocage, NatSpec complet). |
| **`factory`** — *vous êtes ici* | Une version **enrichie qui va au-delà** : `VotingPlus.sol` ajoute la gestion des ex aequo (élection caduque), un administrateur verrouillé, des propositions titrées (titre + description + auteur) et la factorisation des transitions (`_transitionTo`) ; plus le contrat-usine **`VotingFactory`** (gérer N élections) et une **dApp web3** (`web/`). |

🔗 **Démo en ligne** → **[alyra-blockchain-projet-1.onrender.com](https://alyra-blockchain-projet-1.onrender.com/)**
> Sur **Sepolia**, wallet requis — le service gratuit peut prendre ~1 min à se réveiller au premier chargement.

📄 **Énoncé du projet** → [`docs/ENONCE.md`](docs/ENONCE.md)

### Cette branche ajoute, au-delà de l'énoncé

- **`contracts/VotingPlus.sol`** — la version durcie du contrat (ex aequo tranchés, administrateur verrouillé, propositions nommées).
- **`contracts/VotingFactory.sol`** — un contrat-usine pour déployer et cataloguer N élections.
- **`web/`** — une interface web3 (Vue 3 + ethers) qui pilote tout de bout en bout → [`web/README.md`](web/README.md) (captures d'écran incluses).

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
- **Limite héritée d'`Ownable`.** L'administrateur peut céder ou abandonner la propriété en cours d'élection, ce qui gèlerait les phases restantes — limite connue et documentée (corrigée dans `VotingPlus.sol`).
- **Dépendance unique : OpenZeppelin `Ownable` v5** (exigée par l'énoncé) — moins de code importé, moins de surface d'audit.

### Lisibilité et API

- **Erreurs typées uniquement.** Neuf erreurs avec arguments (`WrongWorkflowStatus(attendu, actuel)`, `AlreadyVoted(adresse)`...) : moins chères que les chaînes de caractères et plus précises pour l'appelant.
- **Contrôle d'accès dans les signatures.** `onlyVoters` et `onlyDuring(statut)` : qui peut appeler, et quand, se lit sur la première ligne de chaque fonction.
- **Lecture ouverte assumée.** `voters`, `proposals`, `winningProposalId`, `votesCount` sont publics : sur une blockchain publique, `private` ne cache rien — cohérent avec « le vote n'est pas secret ».
- **`getWinner()` fiable.** Renvoie à tout le monde la proposition gagnante complète (description + score) et échoue avant `VotesTallied` : impossible de lire un gagnant qui n'existe pas encore.
- **NatSpec complet** sur chaque fonction, événement et erreur (intention, `@param`, `@return`).

## Aller plus loin — `VotingPlus.sol`

Copie de `Voting.sol` enrichie d'ajouts ciblés — et de refus assumés, qui comptent autant.

### Ex aequo tranchés : élection caduque

- Le dépouillement détecte l'égalité (comptage des maximums dans la même boucle, toujours O(n)).
- En cas d'égalité : `hasWinner` reste `false` pour toujours, l'event `TieDetected(score, nombre d'ex aequo)` est émis, et `getWinner()` échoue avec `ElectionTied` — le contrat ne désigne **aucun** gagnant plutôt que d'en inventer un.
- **Pas de majorité claire, pas d'action** : l'élection est caduque, on redéploie un nouveau contrat pour revoter (la factory ci-dessous rend ce redéploiement immédiat).
- `hasWinner` est nommé pour que sa valeur par défaut soit honnête à tout moment : `false` se lit « pas (encore) de gagnant ».

### Administrateur immuable

- `transferOwnership()` et `renounceOwnership()` sont désactivés (`OwnershipLocked`) : « l'administrateur est celui qui a déployé » — pour toute la vie du contrat, par construction.
- L'élection ne peut être ni cédée ni rendue orpheline (un abandon en cours de route gèlerait définitivement les phases restantes — la limite documentée de `Voting.sol` est corrigée ici).
- Coût assumé : clé d'administrateur perdue = élection morte → redéploiement.

### Élections et propositions nommées

- **Chaque élection porte un nom** (`electionTitle`), fixé au déploiement, sans setter : il ne peut plus jamais changer.
- **La struct `Proposal` s'enrichit** (écart assumé avec la struct imposée, propre à VotingPlus) : `title` — le nom de la proposition, unique et ≥ 3 octets ; `description` — texte libre, peut être vide ; `proposer` — qui l'a soumise (l'event imposé ne le porte pas, et le `msg.sender` stocké reste vrai même via un relayeur).
- **Les contrôles portent désormais sur le titre de la proposition** (et non plus sur la description) : seuil anti-bruit ≥ 3 octets et anti-doublon par empreinte keccak ; la description, elle, est libre.

### Hygiène interne

- **Les cinq transitions d'état passent par une unique fonction privée** (`_transitionTo`) qui met à jour le statut et émet l'event imposé : une seule source de vérité, impossible de désynchroniser un changement d'état de son événement.
- **`winningProposalId` est privé** : pendant une élection caduque, il ne contient qu'un résidu de boucle sans signification — `getWinner()` est l'unique chemin de lecture du gagnant, et il ne peut pas mentir.

### Alternatives étudiées et écartées

- **Départage aléatoire** : pas de hasard fiable on-chain (les sources naïves — `timestamp`, `prevrandao` — sont influençables par le producteur du bloc) ; un oracle d'aléa vérifiable serait disproportionné ici.
- **Départage par l'administrateur** : un super-vote caché, contraire au principe « aucun privilège de vote pour l'administrateur ».
- **Second tour entre ex aequo** : démocratiquement séduisant, écarté pour son rapport complexité/bénéfice (nouveaux états, suivi des tours de vote, re-égalité possible à gérer).
- **`Pausable`** : un frein d'urgence donnerait à l'administrateur le pouvoir de geler une session de vote ouverte — pouvoir de censure refusé.
- **`Ownable2Step`** : sans objet une fois le transfert désactivé (le verrou est plus fort).
- **Horodatage `createdAt` dans les propositions** : retiré après étude — la date de soumission existe déjà gratuitement dans le bloc qui contient l'event `ProposalRegistered` ; stocker un slot par proposition pour une donnée jamais lue par la logique contredirait la frugalité du contrat.

## Le contrat-usine — `VotingFactory.sol`

Un `Voting` / `VotingPlus` ne vaut que pour **une seule élection** (machine à états à sens unique, dépouillement terminal). Pour qu'une interface gère **N élections** sans redéployer à la main ni jongler avec les adresses, cette branche ajoute un contrat-usine.

- `createVoting(titre)` déploie un nouveau `VotingPlus` et l'enregistre dans un **catalogue public** (`deployedVotings` + event `VotingCreated`) : l'unique adresse qu'une dapp a besoin de connaître pour lister, créer et piloter les élections.
- **L'appelant de `createVoting` devient l'administrateur** de son élection ; la factory n'a pas de propriétaire et aucun pouvoir sur ce qu'elle déploie — et le verrou de `VotingPlus` rend cela définitif.
- **Piège évité** : déployé via la factory, le `msg.sender` vu par le constructor serait la factory elle-même — d'où l'administrateur passé en **paramètre explicite**.
- **Le catalogue vaut double garantie** : bytecode authentique (celui embarqué par la factory) + administrateur ayant signé la création (impossible de créer une élection au nom d'autrui).

## Interface web3 — `web/`

Une dApp **Vue 3 + Reown AppKit + ethers v6** pilote toute la chaîne depuis le navigateur : créer une élection, inscrire des électeurs, faire avancer le workflow, soumettre des propositions, voter, et consulter le résultat (gagnant ou élection caduque). Le panneau s'adapte au **rôle lu on-chain** (administrateur / électeur / spectateur), et les reverts custom du contrat sont décodés en messages lisibles.

→ Détails, architecture, captures d'écran et lancement : [`web/README.md`](web/README.md)

🔗 Démo déployée : **[alyra-blockchain-projet-1.onrender.com](https://alyra-blockchain-projet-1.onrender.com/)**

## Tests (Hardhat)

Suite de **44 tests** automatisés sous **Hardhat 3** (solc `0.8.34`), répartis sur **deux runners** : **5 tests Solidity** (`forge-std`, par *tests de propriétés* — aussi appelés *fuzzing*) pour la logique pure on-chain, et **39 tests TypeScript** (mocha + ethers v6 + chai) qui couvrent le comportement des contrats, de l'unitaire à l'intégration.

### Installation

```bash
npm install          # à la racine du dépôt — installe Hardhat et ses dépendances
```

### Lancer les tests

```bash
npx hardhat test                       # toute la suite (44 tests : Solidity + TypeScript)
npx hardhat test solidity              # uniquement les tests de propriétés Solidity
npx hardhat test mocha                 # uniquement les tests TypeScript
npx hardhat test mocha test/VotingPlus.ts   # un seul fichier
```

### Méthodologie — deux runners, deux techniques

Hardhat 3 fournit **deux runners** et `hardhat test` lance les deux. La distinction n'est **pas** « unitaire vs intégration » (ces deux niveaux existent surtout côté TypeScript) mais porte sur la **technique** et la **portée** :

| Runner | Technique | Portée | Couvre ici |
|---|---|---|---|
| **Solidity** (`forge-std`) | **tests de propriétés** (*fuzzing*) : entrées aléatoires | unitaire, **logique pure on-chain** (in-EVM) | arithmétique, invariants, unicité des titres, conditions de revert, règle de départage |
| **TypeScript** (mocha + ethers) | **tests par scénarios** : cas choisis à la main | du **unitaire** (un contrat : `VotingPlus`) à l'**intégration** (factory → contrat enfant : `VotingFactory`) | déploiement, workflow complet, events, erreurs custom, bout-en-bout |

Règle de répartition : *si le test ne sort pas de l'EVM et gagne à explorer des entrées aléatoires → Solidity ; dès qu'il faut plusieurs signataires, décoder des events/erreurs ou orchestrer plusieurs contrats → TypeScript.* Ce n'est pas une cloison étanche, mais chaque runner est **le meilleur sur son terrain**.

**Solidity (`forge-std`) — tests de propriétés (_fuzzing_).** Plutôt que de choisir ses entrées à la main, on énonce une **propriété** et le runner la rejoue avec **des centaines d'entrées aléatoires** (256 par défaut), en vérifiant qu'elle tient pour toutes — il explore donc des cas qu'on n'aurait pas pensé à écrire. On couvre ainsi la longueur de titre, l'unicité des titres, l'exactitude du comptage des votes et la règle de départage (voir liste plus bas). Ces tests sont écrits **façon Foundry** (`forge-std` : contrat de base `Test`, cheatcodes `vm`) mais **exécutés par le runner Solidity natif de Hardhat 3** (`hardhat test solidity`) — Foundry n'est ni installé ni requis ; `forge-std` n'est qu'une **dépendance npm** de helpers.

> **Pourquoi c'est important.** Sur du code critique (fonds, contrôle d'accès, arithmétique), le fuzzing est une pratique de **sécurité** clé : explorer l'espace des entrées met au jour des cas limites — et parfois des failles — qu'une poignée de tests choisis manque. Nuance honnête : il **augmente la confiance**, il ne *prouve* pas l'absence de bug (l'*invariant testing*, des fuzzers dédiés comme Echidna/Medusa, ou un audit vont plus loin).

**TypeScript (mocha + ethers) — tests par scénarios.** `VotingPlus.ts` couvre le contrat **fonction par fonction** (unitaire) ; `VotingFactory.ts` ajoute l'**intégration** : une factory qui déploie un contrat enfant dont on relit l'`owner` puis qu'on pilote de bout en bout. Plusieurs signataires (administrateur / électeurs / tiers), des **événements** à contrôler (`expect(...).to.emit(...).withArgs(...)`) et des **erreurs custom** à décoder (`revertedWithCustomError(...).withArgs(...)`) : ethers + les matchers chai expriment tout cela depuis l'extérieur via l'ABI.

**Pourquoi ces propriétés en Solidity plutôt qu'en TypeScript :**

- **Le fuzzing est natif côté Solidity** : les paramètres de la fonction de test *sont* les entrées aléatoires, avec `vm.assume` / `bound` pour cadrer le domaine. En TypeScript il faudrait une bibliothèque externe **et** un aller-retour JS↔EVM par itération → des centaines de transactions, lent et lourd.
- **Tout reste dans l'EVM** : ces propriétés (arithmétique, invariant de comptage, condition de revert) ne touchent ni à l'off-chain ni à de l'orchestration — les écrire en TypeScript n'apporterait rien et ajouterait du bruit.
- **Vérité unique** : la propriété attendue est recalculée en Solidity à partir des décomptes, puis comparée au résultat du contrat — aucune valeur « magique » codée en dur.

**Bonnes pratiques côté TypeScript :**

- **Contextes via `loadFixture`** : chaque scénario (déploiement nu, propositions ouvertes, session de vote ouverte…) est une *fixture* déployée **une seule fois** puis **restaurée par snapshot** avant chaque `it` qui la réutilise — isolation stricte (aucun état partagé entre deux tests) et exécution plus rapide qu'un redéploiement systématique.
- **Typage de bout en bout, zéro `any`** : signataires (`HardhatEthersSigner`) et contrats sont entièrement typés via les bindings ethers que Hardhat génère sous `types/` au moment du `compile` (dossier généré, donc non versionné) — l'autocomplétion couvre méthodes, structs et erreurs custom, `.connect(signer)` inclus.

### Liste des tests

#### Tests TypeScript (`mocha` + `ethers`) — par scénarios

**`test/VotingPlus.ts` — 32 tests unitaires** (un seul contrat)

| Groupe | Test (`it`) | Vérifie |
|---|---|---|
| Deployment | initialise l'état | titre, `owner`, statut `RegisteringVoters`, `hasWinner=false`, `votesCount=0` |
| Deployment | titre trop court | revert `TitleTooShort(2, 3)` au déploiement |
| registerVoter | inscrit un électeur | `isRegistered=true` + event `VoterRegistered` |
| registerVoter | non-admin | revert `OwnableUnauthorizedAccount` |
| registerVoter | doublon | revert `VoterAlreadyRegistered` |
| registerVoter | hors phase | revert `WrongWorkflowStatus` |
| Workflow | happy path complet | les 5 transitions + events `WorkflowStatusChange` |
| Workflow | non-admin | revert `OwnableUnauthorizedAccount` |
| Workflow | saut d'étape interdit | revert `WrongWorkflowStatus` |
| Workflow | ≥ 1 proposition requise | revert `NoProposalRegistered` |
| Workflow | ≥ 1 vote requis | revert `NoVoteCast` |
| addProposal | enregistre + auteur | struct (titre/desc/voteCount/proposer) + `ProposalRegistered(0)` |
| addProposal | description vide | acceptée |
| addProposal | non-électeur | revert `VoterNotRegistered` |
| addProposal | titre trop court | revert `TitleTooShort(2, 3)` |
| addProposal | doublon de titre | revert `DuplicateProposal` |
| addProposal | hors phase | revert `WrongWorkflowStatus` |
| vote | enregistre le vote | `voteCount`, `votesCount`, `hasVoted`, `votedProposalId` + event `Voted` |
| vote | non-électeur | revert `VoterNotRegistered` |
| vote | double vote | revert `AlreadyVoted` |
| vote | id invalide | revert `InvalidProposalId(42)` |
| vote | hors phase | revert `WrongWorkflowStatus` |
| tally / getWinner | `getWinner` prématuré | revert `WrongWorkflowStatus` |
| tally / getWinner | gagnant net | `hasWinner=true`, gagnant + score corrects |
| tally / getWinner | ex aequo total | `TieDetected(1, 2)`, `hasWinner=false`, `getWinner` → `ElectionTied` |
| tally / getWinner | dépouillement non-admin | revert `OwnableUnauthorizedAccount` |
| tally / getWinner | 3 propositions `[3,1,1]` | gagnant net désigné |
| tally / getWinner | égalité partielle `[2,2,1]` | `TieDetected(2, 2)` → élection caduque |
| Roles | admin non inscrit | ne peut pas voter → `VoterNotRegistered(admin)` |
| Roles | admin auto-inscrit | peut voter comme tout le monde → `Voted(admin, 0)` |
| Locked ownership | `transferOwnership` | revert `OwnershipLocked` |
| Locked ownership | `renounceOwnership` | revert `OwnershipLocked` |

**`test/VotingFactory.ts` — 7 tests d'intégration** (factory → contrat enfant)

| Test (`it`) | Vérifie |
|---|---|
| catalogue vide | `deployedVotingsCount() == 0` |
| crée et catalogue | event `VotingCreated` + `deployedVotingsCount() == 1` |
| event complet | `VotingCreated(adresse, appelant, titre)` |
| appelant = administrateur | `owner == appelant` (≠ factory), titre + statut initial corrects |
| élections indépendantes | deux appelants → deux élections aux `owner` distincts |
| validation propagée | titre trop court via la factory → revert `TitleTooShort` |
| bout en bout | élection complète pilotée via la factory → gagnant désigné |

#### Tests Solidity (`forge-std`) — tests de propriétés, unitaire

**`test/VotingPlus.t.sol` — 5 tests de propriétés** (256 exécutions aléatoires chacun, _fuzzing_)

| Test | Propriété vérifiée pour **toute** entrée |
|---|---|
| `constructorRejectsShortTitle` | titre de moins de 3 octets → revert `TitleTooShort(longueur, 3)` |
| `constructorAcceptsLongEnoughTitle` | titre de 3 octets ou plus → accepté et stocké tel quel |
| `duplicateProposalTitleAlwaysReverts` | un titre déjà soumis (quelles que soient les descriptions) → revert `DuplicateProposal` |
| `voteAccountingInvariant` | `votesCount == Σ des voteCount == nombre de votants`, et chaque décompte par proposition est exact |
| `winnerIffUniqueStrictMax` | `hasWinner` est vrai **si et seulement si** une seule proposition domine ; toute égalité en tête → `ElectionTied` |

### Couverture

Chaque fonction publique des deux contrats est couverte sur ses **trois axes** : chemin nominal (effets d'état + event émis), contrôle d'accès (`onlyOwner` / `onlyVoters`), et garde de phase (`onlyDuring` → `WrongWorkflowStatus`). S'y ajoutent les cas limites du dépouillement (ex aequo total, ex aequo partiel, gagnant net à ≥ 3 propositions), les garde-fous anti-blocage (`NoProposalRegistered`, `NoVoteCast`) et le verrou d'`ownership`.

Couverture mesurée (instrumentation native de Hardhat 3) :

```bash
npx hardhat test --coverage     # rapport console + HTML dans coverage/html
```

| Contrat | Lignes | Instructions |
|---|---:|---:|
| **`VotingPlus.sol`** | **100 %** | **100 %** |
| **`VotingFactory.sol`** | **100 %** | **100 %** |

> `Voting.sol` (la version conforme à l'énoncé, portée par la branche `main`) est présente mais hors périmètre des tests de cette branche : `VotingPlus.sol` en est la copie durcie.

### Déploiement (Hardhat Ignition)

```bash
# variables chiffrées dans le keystore Hardhat
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY

# déploie la factory (point d'entrée de la dApp)
npx hardhat ignition deploy ignition/modules/VotingFactory.ts --network sepolia
```
