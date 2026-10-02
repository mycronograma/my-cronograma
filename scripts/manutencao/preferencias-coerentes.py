import io

P = 'src/app/(app)/settings/page.tsx'
s = io.open(P, encoding='utf-8').read()


def troca(velho, novo):
    assert velho in s, 'nao achou: %r' % velho[:90]
    assert s.count(velho) == 1, 'aparece %d vezes: %r' % (s.count(velho), velho[:60])
    return s.replace(velho, novo, 1)


# ================================================================
# 1. "Dias de Descanso" e "Permitir pendências no domingo"
#
# Os dois saem. "Dias de Descanso" mandava no MESMO estado que "Horas
# por dia" (0 horas = dia descansado), so por outro caminho: dois
# controles para um valor, sem dizer que estao ligados. E "Permitir
# pendências no domingo" nao era lido por nenhum servico — o toggle
# salvava e nada acontecia. Ambos ficavam na categoria que o #25 pediu
# para cortar: opcao que nao muda resultado.
#
# No lugar, a linha de cada dia passa a dizer "Descanso" quando esta
# desligada, que e a informacao que o usuario procurava no outro bloco.
# ================================================================
s = troca(
    """          {/* Dias de Descanso */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-3">
              Dias de Descanso (sem agendamento automático)
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
              {weekDays.map((day, index) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleExcludeDay(index)}
                  aria-pressed={excludeDays.includes(index)}
                  className={cn(
                    'w-full h-11 rounded-xl font-medium text-sm transition-all touch-manipulation active:scale-[0.99]',
                    excludeDays.includes(index)
                      ? 'bg-neon-purple/20 text-neon-purple border border-neon-purple/50'
                      : 'bg-card-bg text-text-secondary border border-card-border hover:border-neon-purple/30'
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => updateSetting('allowSundayBacklog', !allowSundayBacklog)}
            aria-pressed={allowSundayBacklog}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-xl bg-card-bg border border-card-border text-left touch-manipulation active:scale-[0.995]"
          >
            <div className="min-w-0 pr-2">
              <div className="font-medium text-text-primary">Permitir pendências no domingo</div>
              <div className="text-sm text-text-secondary">
                Usa domingo apenas para reagendamento/backlog, sem alterar a grade fixa.
              </div>
            </div>
            <span
              aria-hidden
              className={cn(
                'relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition-colors duration-200',
                allowSundayBacklog ? 'bg-neon-cyan' : 'bg-card-border'
              )}
            >
              <span
                className={cn(
                  'pointer-events-none inline-block h-5 w-5 rounded-full bg-white transition-transform duration-200',
                  allowSundayBacklog ? 'translate-x-8' : 'translate-x-1'
                )}
              />
            </span>
          </button>
        </div>""",
    """          {/* Dia descansado: sem bloco na agenda. E o mesmo que 0 horas na
              lista acima — la o numero, aqui so o rotulo, para o usuario nao
              achar que sao duas coisas diferentes. */}
          <p className="text-xs text-text-muted">
            Dia com 0 hora vira descanso: o motor nao agenda bloco nenhum nele.
          </p>
        </div>""",
)

# ================================================================
# 2. "Meta diaria de estudo" (slider) x "Horas por dia" (tabela)
#
# O slider aplicava o valor em TODOS os dias ativos de uma vez, sem
# avisar. Quem ajustava Seg=2h e Ter=6h e depois mexia no slider perdia
# a diferenca sem sinal. Agora o rotulo diz o que ele faz e a dica
# manda para a lista quando os dias forem diferentes.
# ================================================================
s = troca(
    """            <label className="block text-sm font-medium text-text-secondary mb-2">
              Meta diaria de estudo: {formatHours(settings.dailyGoalHours)}
            </label>
            <input
              type="range"
              min="1"
              max="12"
              step="0.5"
              value={settings.dailyGoalHours}
              onChange={(e) => handleDailyGoalChange(Number(e.target.value))}
              className="w-full accent-neon-purple"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>1h</span>
              <span>12h</span>
            </div>""",
    """            <label className="block text-sm font-medium text-text-secondary mb-2">
              Horas por dia em todos os dias ativos: {formatHours(settings.dailyGoalHours)}
            </label>
            <input
              type="range"
              min="1"
              max="12"
              step="0.5"
              value={settings.dailyGoalHours}
              onChange={(e) => handleDailyGoalChange(Number(e.target.value))}
              className="w-full accent-neon-purple"
            />
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>1h</span>
              <span>12h</span>
            </div>
            <p className="mt-1.5 text-xs text-text-muted">
              Mexer aqui ajusta os {activeDayValues.length} dia(s) ativo(s) de uma vez. Se sua
              rotina varia por dia, use a lista abaixo — ela manda no valor final.
            </p>""",
)

# ================================================================
# 3. A linha do dia mostra "Descanso" quando esta desligada
# ================================================================
s = troca(
    """                        {label}
                      </button>
                      <div className="flex items-center gap-2">""",
    """                        <span className="flex items-center gap-1.5">
                          {label}
                          {!isActive && (
                            <span className="rounded-full bg-card-border/60 px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                              descanso
                            </span>
                          )}
                        </span>
                      </button>
                      <div className="flex items-center gap-2">""",
)

# ================================================================
# 4. Secao "Configurações da IA": os quatro controles (Dificuldade,
#    Modo Foco, Agendamento Automatico, Pausas Inteligentes) eram
#    salvos e nunca lidos por servico nenhum. A secaoo inteira sai,
#    junto com a entrada no menu — menos um lugar que promete coisa que
#    o app nao faz.
# ================================================================
inicio = s.index("      {/* Configurações da IA */}")
fim = s.index("      {/* Notificações */}")
s = s[:inicio] + s[fim:]

s = troca(
    "type SettingsSection = 'profile' | 'appearance' | 'study' | 'ai' | 'notifications' | 'danger';",
    "type SettingsSection = 'profile' | 'appearance' | 'study' | 'notifications' | 'danger';",
)

s = troca(
    """  ai: {
    title: 'Configurações da IA',
    description: 'Dificuldade e automações',
    icon: Brain,
    iconClassName: 'bg-[#34c759] text-white',
  },
""",
    '',
)

s = troca(
    "  { title: 'Estudo', sections: ['study', 'ai'] },",
    "  { title: 'Estudo', sections: ['study'] },",
)

s = troca(
    "  study: {\n    title: 'Preferências de estudo',\n    description: 'Meta, horários e rotina semanal',",
    "  study: {\n    title: 'Preferências de estudo',\n    description: 'Horas por dia, blocos e rotina semanal',",
)

io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('settings/page.tsx atualizado')
