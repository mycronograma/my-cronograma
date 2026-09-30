/**
 * Teste do SetupWizard (assistente refeito).
 *
 * Garante que as 5 respostas do assistente novo chegam ao motor como uma
 * configuração utilizável: horas por dia preservadas, dias ativos corretos,
 * bloco e intervalo aplicados e data da prova propagada.
 *
 * Rodar: npm run test:setup
 */
import {
  computeStudyPreferences,
} from '../src/services/presetConfigurator';
import { defaultSettings } from '../src/lib/defaultSettings';
import type { PresetWizardAnswers, UserSettings, WeekdayKey } from '../src/types';

let passou = 0;
let falhou = 0;

function checar(rotulo: string, condicao: boolean, detalhe = '') {
  if (condicao) {
    passou += 1;
    console.log(`✔ ${rotulo}`);
  } else {
    falhou += 1;
    console.log(`✘ ${rotulo}${detalhe ? ` — ${detalhe}` : ''}`);
  }
}

/** Respostas exatamente como o SetupWizard monta no passo 5. */
function respostasDoWizard(opcoes: {
  horas: Record<WeekdayKey, number>;
  bloco: number;
  intervalo: number;
  examDate?: string;
  nivel?: 'iniciante' | 'intermediario' | 'avancado';
}): PresetWizardAnswers {
  return {
    goal: 'enem',
    dailyHoursByWeekday: opcoes.horas,
    dailyAvailabilityByWeekday: {
      dom: { start: '', end: '' },
      seg: { start: '', end: '' },
      ter: { start: '', end: '' },
      qua: { start: '', end: '' },
      qui: { start: '', end: '' },
      sex: { start: '', end: '' },
      sab: { start: '', end: '' },
    },
    focusMinutes: opcoes.bloco,
    focusBlockMinutes: opcoes.bloco,
    breakMinutes: opcoes.intervalo,
    firstCycleAllSubjects: true,
    autoSchedule: true,
    smartBreaks: true,
    hardSubjectsPeriodPreference: 'any',
    studyStyle: 'balanced',
    studyContentPreference: 'misto',
    startDate: '2026-10-01',
    endDate: '2026-10-07',
    periodMode: 'date',
    examDate: opcoes.examDate ?? '',
  };
}

const base: UserSettings = { ...defaultSettings, dailyGoalHours: 2 };

console.log('--- SetupWizard: configuracao padrao ---');
{
  const answers = respostasDoWizard({
    horas: { dom: 0, seg: 4, ter: 4, qua: 4, qui: 4, sex: 4, sab: 2 },
    bloco: 50,
    intervalo: 10,
  });
  const { settings, studyPrefs } = computeStudyPreferences(base, answers);

  checar('horas por dia preservadas', settings.dailyHoursByWeekday.seg === 4, `seg=${settings.dailyHoursByWeekday.seg}`);
  checar('domingo zerado continua zerado', settings.dailyHoursByWeekday.dom === 0);
  checar('dias ativos = 6', studyPrefs.daysOfWeek.length === 6, `dias=${studyPrefs.daysOfWeek.length}`);
  checar('bloco de 50 min aplicado', settings.maxBlockMinutes === 50, `bloco=${settings.maxBlockMinutes}`);
  checar('intervalo de 10 min aplicado', settings.breakMinutes === 10, `intervalo=${settings.breakMinutes}`);
  checar('meta diaria = media dos dias ativos', settings.dailyGoalHours === 3.5, `meta=${settings.dailyGoalHours}`);
  checar('total semanal = 22h', studyPrefs.weeklyHours === 22, `semana=${studyPrefs.weeklyHours}`);
  checar('sem prova: modo aleatorio', studyPrefs.mode === 'random');
}

console.log('\n--- SetupWizard: com data de prova ---');
{
  const answers = respostasDoWizard({
    horas: { dom: 0, seg: 5, ter: 5, qua: 5, qui: 5, sex: 5, sab: 3 },
    bloco: 25,
    intervalo: 5,
    examDate: '2026-11-15',
  });
  const { settings, studyPrefs } = computeStudyPreferences(base, answers);

  checar('data da prova propagada para settings', settings.examDate === '2026-11-15', `examDate=${settings.examDate}`);
  checar('data da prova propagada para studyPrefs', studyPrefs.examDate === '2026-11-15');
  checar('com prova: modo exame', studyPrefs.mode === 'exam');
  checar('bloco curto de 25 min aplicado', settings.maxBlockMinutes === 25, `bloco=${settings.maxBlockMinutes}`);
  checar('intervalo curto de 5 min aplicado', settings.breakMinutes === 5);
  checar('total semanal = 28h', studyPrefs.weeklyHours === 28, `semana=${studyPrefs.weeklyHours}`);
}

console.log('\n--- SetupWizard: poucos dias ---');
{
  const answers = respostasDoWizard({
    horas: { dom: 0, seg: 0, ter: 0, qua: 0, qui: 2, sex: 2, sab: 0 },
    bloco: 90,
    intervalo: 15,
  });
  const { settings, studyPrefs } = computeStudyPreferences(base, answers);

  checar('so 2 dias ativos', studyPrefs.daysOfWeek.length === 2, `dias=${studyPrefs.daysOfWeek.length}`);
  checar('dias ativos sao qui e sex', studyPrefs.daysOfWeek.includes(4) && studyPrefs.daysOfWeek.includes(5));
  checar('dias excluidos = 5', settings.excludeDays.length === 5, `excluidos=${settings.excludeDays.length}`);
  checar('bloco longo de 90 min aplicado', settings.maxBlockMinutes === 90);
  checar('total semanal = 4h', studyPrefs.weeklyHours === 4, `semana=${studyPrefs.weeklyHours}`);
}

console.log('\n--- SetupWizard: sem nenhum dia marcado ---');
{
  const answers = respostasDoWizard({
    horas: { dom: 0, seg: 0, ter: 0, qua: 0, qui: 0, sex: 0, sab: 0 },
    bloco: 50,
    intervalo: 10,
  });
  const { settings, studyPrefs } = computeStudyPreferences(base, answers);

  // O assistente barra esse caso na tela, mas o motor nao pode quebrar.
  checar('zero dias nao gera excecao', Number.isFinite(settings.dailyGoalHours));
  checar('zero dias: sem dias ativos', studyPrefs.daysOfWeek.length === 0);
  checar('zero dias: semanal zerada', studyPrefs.weeklyHours === 0);
}

console.log(`\n${passou} passaram, ${falhou} falharam.`);
if (falhou > 0) process.exit(1);
