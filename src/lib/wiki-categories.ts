export const wikiCategoryGroups = [
  { id: "people", label: "Personnes", description: "Celles et ceux qui font vivre la classe et le lycée.", categories: [
    { id: "PEOPLE_STUDENTS", label: "Élèves", description: "Portraits et histoires des élèves de la promo." },
    { id: "PEOPLE_TEACHERS", label: "Professeurs", description: "Les professeurs et leurs légendes de salle de classe." },
    { id: "PEOPLE_STAFF", label: "Personnel du lycée", description: "Toutes les autres personnes croisées au lycée." },
  ] },
  { id: "class", label: "Vie de la classe", description: "Les lieux, projets et moments à ne pas oublier.", categories: [
    { id: "CLASS_MOMENTS", label: "Moments marquants", description: "Anecdotes, événements et souvenirs." },
    { id: "CLASS_PROJECTS", label: "Projets", description: "Les créations et travaux de la promo." },
    { id: "CLASS_PLACES", label: "Lieux", description: "Salles, coins favoris et territoires mythiques." },
  ] },
  { id: "sioverse", label: "SIOVerse", description: "Tout ce qui concerne notre univers numérique.", categories: [
    { id: "SIOVERSE_LORE", label: "Lore du SIOVerse", description: "Histoire et coulisses du projet." },
    { id: "SIOVERSE_GUIDES", label: "Guides", description: "Comment utiliser les outils du site." },
  ] },
  { id: "other", label: "Autres sujets", description: "Les articles qui ne rentrent dans aucune autre branche.", categories: [
    { id: "OTHER", label: "À classer", description: "Un point de départ pour les nouveaux sujets." },
  ] },
] as const;

export const wikiCategoryIds = ["PEOPLE_STUDENTS", "PEOPLE_TEACHERS", "PEOPLE_STAFF", "CLASS_MOMENTS", "CLASS_PROJECTS", "CLASS_PLACES", "SIOVERSE_LORE", "SIOVERSE_GUIDES", "OTHER"] as const;
export type WikiCategoryId = typeof wikiCategoryIds[number];

export function wikiCategoryInfo(id: string) {
  for (const group of wikiCategoryGroups) {
    const category = group.categories.find((item) => item.id === id);
    if (category) return { group, category };
  }
  return { group: wikiCategoryGroups[3], category: wikiCategoryGroups[3].categories[0] };
}
