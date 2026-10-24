export const GENERATIONAL_GROUPS = [
  'Children Service',
  'Junior Youth (JY)',
  "Young People's Guild (YPG)",
  'Young Adults Fellowship (YAF)',
  "Women's Fellowship",
  "Men's Fellowship",
] as const;

const LEGACY_GROUP_NAMES: Record<string, (typeof GENERATIONAL_GROUPS)[number]> = {
  YPG: "Young People's Guild (YPG)",
  YAF: 'Young Adults Fellowship (YAF)',
  'Womens Fellowship': "Women's Fellowship",
  'Mens Fellowship': "Men's Fellowship",
};

export function canonicalGroupName(name: string): string {
  return LEGACY_GROUP_NAMES[name.trim()] ?? name.trim();
}
