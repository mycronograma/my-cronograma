export interface ScheduleProfile {
  id: string;
  name: string;
  description: string;
  hoursPerDay: number;
}

export const defaultScheduleProfiles: ScheduleProfile[] = [
  {
    id: 'balanced',
    name: 'Balanceado',
    description: 'Distribuição uniforme de estudos e revisões.',
    hoursPerDay: 3,
  },
  {
    id: 'intensive',
    name: 'Intensivo',
    description: 'Carga horária alta focada em editais abertos.',
    hoursPerDay: 5,
  },
];

export function getScheduleProfile(id: string): ScheduleProfile {
  return defaultScheduleProfiles.find((p) => p.id === id) || defaultScheduleProfiles[0];
}
