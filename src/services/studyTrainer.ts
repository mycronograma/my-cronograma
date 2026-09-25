export interface StudyTrainerTip {
  id: string;
  title: string;
  content: string;
  category: 'focus' | 'retention' | 'pacing' | 'general';
}

export const defaultTrainerTips: StudyTrainerTip[] = [
  {
    id: '1',
    title: 'Técnica Pomodoro',
    content: 'Estude com foco total por 25 minutos e descanse 5 minutos.',
    category: 'focus',
  },
  {
    id: '2',
    title: 'Revisão Ativa',
    content: 'Faça perguntas a si mesmo sobre o conteúdo estudado em vez de apenas reler.',
    category: 'retention',
  },
];

export function getStudyTrainerTip(): StudyTrainerTip {
  return defaultTrainerTips[0];
}
