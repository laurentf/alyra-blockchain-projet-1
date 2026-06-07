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
- **NatSpec complet** (généré avec assistance IA, relu et validé par l'auteur).

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

Suite de tests automatisés sous **Hardhat 3** (mocha + ethers + chai, solc `0.8.34`).

### Installation

```bash
npm install          # à la racine du dépôt — installe Hardhat et ses dépendances
```

### Lancer les tests

```bash
npx hardhat test                      # toute la suite (39 tests)
npx hardhat test test/VotingPlus.ts   # une seule suite
```

### Couverture

| Suite | Cas testés |
|---|---|
| **`VotingPlus`** (32) | déploiement (+ titre trop court) · whitelist (admin / doublon / hors phase) · workflow complet avec events `WorkflowStatusChange` + transitions illégales + garde-fous liveness (`NoProposalRegistered`, `NoVoteCast`) · propositions (auteur, anti-bruit, anti-doublon, hors phase) · vote (double vote, id invalide, hors phase) · dépouillement **gagnant net vs ex aequo** (`TieDetected` / `ElectionTied`), gagnant à 3 propositions et **égalité partielle** `[2,2,1]` · `getWinner` prématuré · **admin sans privilège de vote** (doit s'inscrire) · **ownership verrouillé** (`OwnershipLocked`) |
| **`VotingFactory`** (7) | catalogue vide → rempli · event `VotingCreated` · **appelant = administrateur** (≠ factory) · élections indépendantes par appelant · propagation de la validation du titre · **élection fonctionnelle de bout en bout** via la factory |

### Déploiement (Hardhat Ignition)

```bash
# variables chiffrées dans le keystore Hardhat
npx hardhat keystore set SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_PRIVATE_KEY

# déploie la factory (point d'entrée de la dApp)
npx hardhat ignition deploy ignition/modules/VotingFactory.ts --network sepolia
```
