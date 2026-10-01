#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Tira a escolha manual de horario de Ajustes e faz a janela caber nas horas."""
import io

P = 'src/app/(app)/settings/page.tsx'
s = io.open(P, encoding='utf-8').read()

def troca(velho, novo, rotulo):
    global s
    assert velho in s, 'ANCORA NAO ENCONTRADA: ' + rotulo
    s = s.replace(velho, novo, 1)
    print('ok:', rotulo)

# ------------------------------------------------ 1. utilitarios de horario
troca(
    "import { cn, formatHoursDuration } from '@/lib/utils';",
    "import { cn, formatHoursDuration, minutesToTime, timeToMinutes } from '@/lib/utils';",
    'import minutesToTime/timeToMinutes'
)

# ------------------------------------------------ 2. remove o componente orfao
troca(
    "import TimePickerField from '@/components/settings/TimePickerField';\n",
    "",
    'import TimePickerField fora'
)

# ------------------------------- 3. janela se ajusta as horas (sem corte silencioso)
VELHO_UPDATE = """    setSettings((prev) => ({
      ...prev,
      dailyHoursByWeekday: nextHours,
      excludeDays: nextExcludeDays,
      dailyGoalHours: Number(nextAverage.toFixed(1)),
    }));"""
assert VELHO_UPDATE in s, 'setSettings do updateDailyHours'

NOVO_UPDATE = """    // A janela do dia se ajusta para caber as horas pedidas. Antes a janela era
    // fixa e as horas eram cortadas em silencio: pedia 6h, estudava 4h, e nada
    // avisava. Como a escolha manual de horario saiu do app, quem aumenta as
    // horas precisa ganhar a janela correspondente.
    const janelaAtual = (settings.dailyAvailabilityByWeekday ?? {}) as Record<
      string,
      { start: string; end: string }
    >;
    const proximaJanela: Record<string, { start: string; end: string }> = { ...janelaAtual };
    weekDayKeys.forEach((key) => {
      const horas = nextHours[key];
      if (!horas || horas <= 0) return;
      const janela = janelaAtual[key];
      const inicio = janela?.start || settings.preferredStart || '08:00';
      const larguraAtual = janela
        ? timeToMinutes(janela.end) - timeToMinutes(janela.start)
        : 0;
      if (larguraAtual < Math.round(horas * 60)) {
        proximaJanela[key] = {
          start: inicio,
          end: minutesToTime(timeToMinutes(inicio) + Math.round(horas * 60)),
        };
      }
    });

    setSettings((prev) => ({
      ...prev,
      dailyHoursByWeekday: nextHours,
      excludeDays: nextExcludeDays,
      dailyGoalHours: Number(nextAverage.toFixed(1)),
      dailyAvailabilityByWeekday: proximaJanela as typeof prev.dailyAvailabilityByWeekday,
    }));"""
s = s.replace(VELHO_UPDATE, NOVO_UPDATE, 1)
print('ok: janela acompanha as horas')

# ---------------------------------------- 4. campos de horario viram resumo
VELHO_CAMPOS = """          {/* Janela de Tempo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Horário de Início Preferido
              </label>
              {isMobile && isIOS ? (
                <TimePickerField
                  label="Horário de início preferido"
                  value={settings.preferredStart}
                  onChange={(next) => updateSetting('preferredStart', next)}
                />
              ) : (
                <input
                  type="time"
                  value={settings.preferredStart}
                  onChange={(e) => updateSetting('preferredStart', e.target.value)}
                  className="input-field py-2.5"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-2">
                Horário de Término Preferido
              </label>
              {isMobile && isIOS ? (
                <TimePickerField
                  label="Horário de término preferido"
                  value={settings.preferredEnd}
                  onChange={(next) => updateSetting('preferredEnd', next)}
                />
              ) : (
                <input
                  type="time"
                  value={settings.preferredEnd}
                  onChange={(e) => updateSetting('preferredEnd', e.target.value)}
                  className="input-field py-2.5"
                />
              )}
            </div>
          </div>
"""
assert VELHO_CAMPOS in s, 'campos de horario'

NOVO_CAMPOS = """          {/* Janela de tempo - so leitura.
              A escolha manual de horario saiu do app: eram dois campos a mais
              para um resultado que o app ja sabe sozinho. Quem manda e "Horas
              por dia" acima; a janela se ajusta para caber. */}
          <div className="rounded-xl border border-card-border bg-card-bg/50 p-4">
            <p className="text-sm font-medium text-text-primary">Quando voce estuda</p>
            <p className="mt-1 text-sm text-text-secondary">
              {resumoJanela}
            </p>
            <p className="mt-1.5 text-xs text-text-muted">
              Definido no assistente de configuracao. Para mudar, refaca a
              predefinicao - ou ajuste as horas por dia acima, que a janela se
              ajusta sozinha.
            </p>
          </div>
"""
s = s.replace(VELHO_CAMPOS, NOVO_CAMPOS, 1)
print('ok: campos viram resumo')

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('\nAjustes gravado.')
