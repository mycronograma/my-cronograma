import {
  Atom,
  Book,
  BookOpen,
  BookText,
  Brain,
  Calculator,
  Code,
  Cpu,
  Dna,
  Dumbbell,
  FlaskConical,
  Globe,
  GraduationCap,
  History,
  Landmark,
  Languages,
  Leaf,
  Microscope,
  Music,
  Palette,
  PenTool,
  Ruler,
  Scale,
  Sigma,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Ícones por matéria. As chaves são as mesmas usadas em src/lib/enemCatalog.ts
 * (icon: 'calculator', 'atom', ...) — o card de matéria passa a renderizar
 * o ícone salvo em subject.icon em vez de um livro fixo.
 */
export const SUBJECT_ICON_MAP: Record<string, LucideIcon> = {
  book: Book,
  'book-open': BookOpen,
  'book-text': BookText,
  'pen-tool': PenTool,
  languages: Languages,
  palette: Palette,
  'messages-square': Users,
  calculator: Calculator,
  sigma: Sigma,
  atom: Atom,
  flask: FlaskConical,
  leaf: Leaf,
  dna: Dna,
  landmark: Landmark,
  globe: Globe,
  brain: Brain,
  users: Users,
  history: History,
  ruler: Ruler,
  microscope: Microscope,
  scale: Scale,
  music: Music,
  dumbbell: Dumbbell,
  cpu: Cpu,
  code: Code,
  graduation: GraduationCap,
};

export const DEFAULT_SUBJECT_ICON = 'book';

export function getSubjectIconComponent(iconKey?: string | null): LucideIcon {
  return (iconKey && SUBJECT_ICON_MAP[iconKey]) || SUBJECT_ICON_MAP[DEFAULT_SUBJECT_ICON];
}

/** Opções exibidas no seletor do formulário de matéria. */
export const SUBJECT_ICON_OPTIONS: { key: string; label: string }[] = [
  { key: 'book-open', label: 'Livro' },
  { key: 'calculator', label: 'Calculadora' },
  { key: 'sigma', label: 'Sigma' },
  { key: 'atom', label: 'Átomo' },
  { key: 'flask', label: 'Química' },
  { key: 'leaf', label: 'Natureza' },
  { key: 'dna', label: 'DNA' },
  { key: 'microscope', label: 'Microscópio' },
  { key: 'landmark', label: 'História/Direito' },
  { key: 'globe', label: 'Geografia' },
  { key: 'languages', label: 'Idiomas' },
  { key: 'pen-tool', label: 'Redação' },
  { key: 'palette', label: 'Artes' },
  { key: 'music', label: 'Música' },
  { key: 'dumbbell', label: 'Educação física' },
  { key: 'brain', label: 'Filosofia/Psicologia' },
  { key: 'scale', label: 'Direito' },
  { key: 'history', label: 'História' },
  { key: 'ruler', label: 'Geometria' },
  { key: 'cpu', label: 'Informática' },
  { key: 'code', label: 'Programação' },
  { key: 'graduation', label: 'Geral' },
];

/**
 * Sugestão automática de ícone pelo nome da matéria (pt-BR), para disciplinas
 * personalizadas que não vêm do catálogo ENEM.
 */
const SUBJECT_NAME_RULES: { key: string; words: string[] }[] = [
  { key: 'calculator', words: ['matemática', 'matematica', 'math', 'álgebra', 'algebra', 'geometria', 'cálculo', 'calculo'] },
  { key: 'atom', words: ['física', 'fisica', 'physics'] },
  { key: 'flask', words: ['química', 'quimica', 'chemistry'] },
  { key: 'leaf', words: ['biologia', 'biology'] },
  { key: 'dna', words: ['genética', 'genetica', 'genetics'] },
  { key: 'microscope', words: ['microbiologia'] },
  { key: 'landmark', words: ['história', 'historia', 'history'] },
  { key: 'globe', words: ['geografia', 'geography'] },
  { key: 'languages', words: ['inglês', 'ingles', 'espanhol', 'francês', 'frances', 'alemão', 'italiano', 'idioma', 'english', 'language'] },
  { key: 'book-text', words: ['português', 'portugues', 'literatura', 'language arts'] },
  { key: 'pen-tool', words: ['redação', 'redacao', 'writing', 'writing'] },
  { key: 'palette', words: ['artes', 'arte', 'art'] },
  { key: 'music', words: ['música', 'musica', 'music'] },
  { key: 'dumbbell', words: ['educação física', 'educacao fisica', 'ed. física', 'physical'] },
  { key: 'brain', words: ['filosofia', 'psicologia', 'sociologia', 'philosophy', 'psychology'] },
  { key: 'scale', words: ['direito', 'law'] },
  { key: 'ruler', words: ['desenho', 'design'] },
  { key: 'cpu', words: ['informática', 'informatica', 'computação', 'computacao'] },
  { key: 'code', words: ['programação', 'programacao', 'coding', 'lógica', 'logica'] },
];

export function autoIconForSubjectName(name: string): string {
  const normalized = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
  for (const rule of SUBJECT_NAME_RULES) {
    if (rule.words.some((w) => normalized.includes(w))) return rule.key;
  }
  return DEFAULT_SUBJECT_ICON;
}

/** Componente que renderiza o ícone salvo da matéria (com fallback para livro). */
export function SubjectIcon({
  iconKey,
  className,
  style,
}: {
  iconKey?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const Icon = getSubjectIconComponent(iconKey);
  return <Icon className={className} style={style} />;
}
