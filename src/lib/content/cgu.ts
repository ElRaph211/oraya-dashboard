/**
 * lib/content/cgu.ts
 * Conditions Générales d'Utilisation — Oraya Dashboard
 *
 * Injecter dans le composant CGU de l'onboarding :
 *   import { CGU_CONTENT, CGU_VERSION, CGU_DATE } from '@/lib/content/cgu'
 *
 * À mettre à jour à chaque révision majeure.
 * Incrémenter CGU_VERSION pour forcer la re-validation des clients existants.
 */

export const CGU_VERSION = "1.0";
export const CGU_DATE    = "1er juin 2026";
export const CGU_EDITOR  = "Oraya System — Raphaël Aubry";

export const CGU_CONTENT = `
CONDITIONS GÉNÉRALES D'UTILISATION
Oraya Dashboard — dashboard.orayasystem.fr
Version ${CGU_VERSION} — En vigueur à compter du ${CGU_DATE}

═══════════════════════════════════════════════════════════════════════

ARTICLE 1 — OBJET ET CHAMP D'APPLICATION

Les présentes Conditions Générales d'Utilisation (ci-après « CGU ») régissent
l'accès et l'utilisation du tableau de bord en ligne Oraya Dashboard,
accessible à l'adresse https://dashboard.orayasystem.fr (ci-après « le
Service »), édité par Oraya System, représenté par Raphaël Aubry,
(ci-après « Oraya »).

Le Service est un outil de pilotage du recouvrement de créances commerciales
B2B destiné exclusivement aux clients professionnels d'Oraya (ci-après
« l'Utilisateur »). Il permet de visualiser l'état du portefeuille de créances,
de suivre les relances automatisées, et de superviser les actions de
recouvrement menées par Oraya pour le compte de l'Utilisateur.

L'accès au Service est strictement réservé aux personnes morales ou physiques
ayant conclu un contrat de service avec Oraya. Tout accès non autorisé est
interdit.

La création d'un compte vaut acceptation pleine et entière des présentes CGU.
En cas de désaccord, l'Utilisateur doit s'abstenir d'utiliser le Service et
en informer Oraya à l'adresse : raphael@orayasystem.fr.


═══════════════════════════════════════════════════════════════════════

ARTICLE 2 — ACCÈS AU SERVICE

2.1 Création du compte
Les comptes utilisateurs sont créés exclusivement par Oraya. L'Utilisateur
reçoit un lien d'accès unique (magic link) à l'adresse email communiquée lors
de la signature du contrat de service. Ce lien est valable 24 heures. À
l'expiration, l'Utilisateur peut en demander un nouveau auprès d'Oraya.

2.2 Identifiants et sécurité
Lors de la première connexion, l'Utilisateur définit son mot de passe. Il est
seul responsable de la confidentialité de ses identifiants et de toute
utilisation effectuée depuis son compte. Tout accès non autorisé constaté doit
être signalé immédiatement à Oraya.

2.3 Responsabilité de l'Utilisateur
L'Utilisateur s'engage à utiliser le Service conformément à sa destination, à
ne pas tenter d'en contourner les mécanismes de sécurité, et à ne pas accéder
aux données d'autres clients d'Oraya.

2.4 Profils et rôles
Le Service distingue deux niveaux d'accès : l'administrateur (Oraya) et le
client (l'Utilisateur). L'Utilisateur accède uniquement à son propre espace,
isolé par des mécanismes techniques (Row Level Security). Oraya peut accéder
à l'ensemble des espaces clients dans le cadre de l'exécution du service.

2.5 Disponibilité
Oraya s'efforce d'assurer la disponibilité du Service 24h/24 et 7j/7. Des
interruptions pour maintenance peuvent survenir et seront, dans la mesure du
possible, annoncées à l'avance. Oraya ne peut être tenu responsable des
interruptions liées aux prestataires tiers (Supabase, Railway, Resend).


═══════════════════════════════════════════════════════════════════════

ARTICLE 3 — DESCRIPTION DU SERVICE

3.1 Fonctionnalités principales
Le Service met à disposition de l'Utilisateur :
- Un tableau de bord de pilotage de son portefeuille de créances
- La visualisation des débiteurs, de leur profil de risque et de leur encours
- L'historique des relances effectuées par Oraya en son nom
- La validation des relances concernant ses clients stratégiques
- Le suivi des plans de paiement négociés
- Des indicateurs de performance (DSO, balance âgée, prévisionnel d'encaissements)
- L'import de données de facturation (CSV/XLSX)
- Un récapitulatif hebdomadaire automatique

3.2 Limites du Service
Le Service est un outil de pilotage et de suivi. Il ne constitue pas un conseil
juridique, comptable ou financier. Les indicateurs prévisionnels (J+30, J+60,
J+90) sont des estimations probabilistes et ne constituent pas des engagements
de résultat d'Oraya.

3.3 Évolutions du Service
Oraya se réserve le droit de modifier, améliorer ou supprimer des
fonctionnalités à tout moment. Les modifications substantielles feront l'objet
d'une notification préalable à l'Utilisateur.


═══════════════════════════════════════════════════════════════════════

ARTICLE 4 — DONNÉES PERSONNELLES ET RGPD

4.1 Qualité des parties au sens du RGPD
Dans le cadre du Service, Oraya agit en qualité de sous-traitant au sens de
l'article 4(8) du Règlement (UE) 2016/679 (RGPD). L'Utilisateur est le
responsable du traitement de ses propres données clients (débiteurs, contacts,
factures).

4.2 Données traitées par Oraya pour le compte de l'Utilisateur
Oraya traite, pour les besoins du service de recouvrement :
- Les données d'identification des débiteurs (raison sociale, SIREN, contacts)
- Les données financières (factures, montants, échéances, statuts)
- Les échanges par email avec les débiteurs

4.3 Données traitées par Oraya en tant que responsable de traitement
Pour le fonctionnement du Service, Oraya collecte :
- Les données d'identification de l'Utilisateur (nom, email, téléphone)
- Les données de connexion et d'utilisation (logs, adresses IP)
- Les préférences de paramétrage

Base légale : exécution du contrat de service (art. 6.1.b RGPD).

4.4 Durée de conservation
Les données sont conservées pendant la durée du contrat de service, augmentée
d'une période de 30 jours après sa résiliation, délai permettant à
l'Utilisateur d'exporter ses données. Les données de facturation sont conservées
10 ans conformément aux obligations légales comptables.

4.5 Droits des personnes
L'Utilisateur dispose des droits d'accès, rectification, effacement, portabilité
et opposition sur ses données personnelles. Exercice auprès de :
raphael@orayasystem.fr.

Si un débiteur de l'Utilisateur exerce son droit à l'effacement, l'Utilisateur
s'engage à en informer Oraya immédiatement afin que les données soient supprimées
de la base Oraya Dashboard.

4.6 Sous-traitants techniques
Le Service s'appuie sur les prestataires suivants, liés par des accords de
sous-traitance conformes au RGPD :
- Supabase Inc. (base de données — hébergement Union Européenne)
- Railway Corp. (hébergement de l'application)
- Resend Inc. (envoi et réception d'emails)
- Anthropic Inc. (traitement IA des emails — données pseudonymisées)

4.7 Transferts hors UE
Les prestataires Railway, Resend et Anthropic sont des sociétés américaines. Les
transferts sont encadrés par les clauses contractuelles types de la Commission
européenne (CCT). L'Utilisateur est informé de cette situation et en accepte
les termes en utilisant le Service.


═══════════════════════════════════════════════════════════════════════

ARTICLE 5 — MANDAT D'ALIAS EMAIL ET IDENTITÉ D'ENVOI

5.1 Nature du mandat
Dans le cadre du service de recouvrement, Oraya envoie des emails aux débiteurs
de l'Utilisateur depuis une adresse email associée au domaine de l'Utilisateur
(ci-après « l'alias »), par exemple : comptabilite@nomdedomaine.fr.

Ce mandat est un acte de représentation : Oraya agit au nom et pour le compte
de l'Utilisateur. L'Utilisateur mandate expressément Oraya pour cette action en
acceptant les présentes CGU.

5.2 Identité d'envoi
Les emails peuvent être envoyés sous un nom de rôle fonctionnel (ex. « Service
Comptabilité »). En droit B2B français, l'utilisation d'un nom de rôle
fonctionnel pour la gestion du poste client est une pratique légale sous réserve
que l'email contienne les mentions légales obligatoires de l'entreprise de
l'Utilisateur (raison sociale, SIREN, adresse), ce à quoi Oraya s'engage.

5.3 Responsabilité de l'Utilisateur
L'Utilisateur est responsable de la mise en place technique de l'alias
(configuration DNS, SMTP). Il s'assure que l'utilisation de cet alias est
conforme aux conditions générales de son hébergeur de messagerie.

5.4 Réponses des débiteurs
Les réponses des débiteurs sont reçues par Oraya sur l'adresse de gestion
(relances@orayasystem.fr). L'Utilisateur en est informé via le dashboard et
les récapitulatifs hebdomadaires.


═══════════════════════════════════════════════════════════════════════

ARTICLE 6 — PROPRIÉTÉ INTELLECTUELLE

6.1 Propriété d'Oraya
Le Service, son interface, ses algorithmes, ses contenus (textes, graphiques,
logotype Oraya, templates de relance, méthode de scoring) sont la propriété
exclusive d'Oraya et sont protégés par le droit de la propriété intellectuelle.
Toute reproduction, adaptation ou utilisation sans autorisation écrite d'Oraya
est interdite.

6.2 Données de l'Utilisateur
Les données importées par l'Utilisateur (factures, contacts débiteurs, etc.)
restent sa propriété exclusive. Oraya n'y accède que dans le cadre de
l'exécution du service. Aucune utilisation à des fins autres que le service
contractuellement défini n'est autorisée.

6.3 Feedback et suggestions
Toute suggestion d'amélioration communiquée à Oraya peut être librement
utilisée par Oraya sans contrepartie.


═══════════════════════════════════════════════════════════════════════

ARTICLE 7 — CONFIDENTIALITÉ

Chaque partie s'engage à ne pas divulguer les informations confidentielles de
l'autre partie auxquelles elle aurait accès dans le cadre de l'utilisation du
Service. Sont considérées comme confidentielles toutes les informations
désignées comme telles ou dont la nature confidentielle est évidente, notamment
les données financières des débiteurs, la méthode Oraya, et les paramètres
de configuration.

Cette obligation de confidentialité survit à la résiliation du contrat pendant
une durée de 3 ans.


═══════════════════════════════════════════════════════════════════════

ARTICLE 8 — RESPONSABILITÉS ET GARANTIES

8.1 Responsabilité d'Oraya
Oraya s'engage à mettre en œuvre les moyens techniques et humains nécessaires
au bon fonctionnement du Service (obligation de moyens). Oraya ne peut être
tenu responsable :
- Des décisions de gestion prises par l'Utilisateur sur la base des informations
  fournies par le Service
- Des résultats obtenus en matière de recouvrement (les indicateurs prévisionnels
  sont des estimations, non des engagements)
- Des interruptions de service liées aux prestataires tiers
- Des erreurs dans les données importées par l'Utilisateur

La responsabilité d'Oraya est en tout état de cause limitée au montant des
sommes versées par l'Utilisateur au titre des 3 derniers mois du service.

8.2 Responsabilité de l'Utilisateur
L'Utilisateur est responsable de l'exactitude des données qu'il importe dans
le Service, de la légalité des créances dont il confie le recouvrement à Oraya,
et du respect des présentes CGU.


═══════════════════════════════════════════════════════════════════════

ARTICLE 9 — RÉSILIATION ET SUSPENSION

9.1 Résiliation par l'Utilisateur
L'Utilisateur peut mettre fin au service dans les conditions prévues au contrat
de service. La résiliation entraîne la désactivation de l'accès au dashboard
à l'expiration du préavis contractuel.

9.2 Suspension par Oraya
Oraya se réserve le droit de suspendre ou de résilier l'accès au Service
en cas de :
- Non-paiement des sommes dues
- Violation des présentes CGU
- Utilisation abusive ou frauduleuse du Service
- Force majeure

9.3 Conséquences de la résiliation
À la résiliation, l'Utilisateur dispose de 30 jours pour exporter ses données
(via l'interface d'export CSV). Passé ce délai, les données sont supprimées
conformément à la politique de conservation (article 4.4).


═══════════════════════════════════════════════════════════════════════

ARTICLE 10 — MODIFICATIONS DES CGU

Oraya se réserve le droit de modifier les présentes CGU à tout moment. Les
modifications sont notifiées à l'Utilisateur par email au moins 15 jours avant
leur entrée en vigueur. La poursuite de l'utilisation du Service après cette
date vaut acceptation des nouvelles CGU.

En cas de modification substantielle, un nouvel accord explicite (case à cocher)
sera demandé à l'Utilisateur lors de sa prochaine connexion.

Le numéro de version des CGU acceptées est enregistré dans le compte de
l'Utilisateur (champ cgu_accepted_version dans auth.users.user_metadata).


═══════════════════════════════════════════════════════════════════════

ARTICLE 11 — DROIT APPLICABLE ET JURIDICTION

Les présentes CGU sont soumises au droit français. En cas de litige, les
parties s'engagent à rechercher une solution amiable avant toute action
judiciaire. À défaut d'accord amiable, les tribunaux compétents du ressort
du siège social d'Oraya seront seuls compétents.


═══════════════════════════════════════════════════════════════════════

ARTICLE 12 — DISPOSITIONS DIVERSES

12.1 Intégralité de l'accord
Les présentes CGU, conjointement avec le contrat de service signé, constituent
l'intégralité de l'accord entre les parties concernant l'utilisation du Service.

12.2 Divisibilité
Si une disposition des présentes CGU est déclarée nulle ou inapplicable, les
autres dispositions restent en vigueur.

12.3 Non-renonciation
Le fait pour Oraya de ne pas se prévaloir d'une disposition des présentes CGU
ne constitue pas une renonciation à s'en prévaloir ultérieurement.

12.4 Contact
Pour toute question relative aux présentes CGU :
Oraya System — Raphaël Aubry
Email : raphael@orayasystem.fr
Site  : https://orayasystem.fr


═══════════════════════════════════════════════════════════════════════

Dernière mise à jour : ${CGU_DATE}
Version : ${CGU_VERSION}
`;

/** Texte court pour l'interface onboarding (checkbox) */
export const CGU_CHECKBOX_LABEL =
  "J'ai lu et j'accepte les Conditions Générales d'Utilisation et le Mandat d'Alias Email d'Oraya System.";

/** Résumé des points clés pour l'affichage en introduction */
export const CGU_KEY_POINTS = [
  "Oraya agit comme sous-traitant de vos données clients (RGPD)",
  "Vos données sont isolées — aucun autre client n'y a accès",
  "Les emails sont envoyés depuis votre alias en votre nom (mandat)",
  "Données conservées 30 jours après résiliation, puis supprimées",
  "Résiliation possible à tout moment selon les conditions du contrat",
];
