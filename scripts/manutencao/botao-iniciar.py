#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Refina a regra do botao Iniciar: some em concluido e em andamento."""
import io

P = 'src/components/dashboard/TodayPlan.tsx'
s = io.open(P, encoding='utf-8').read()

velho = """                      {/* \"Iniciar\" s\u00f3 para o que ainda vai ser feito. Antes
                          aparecia até em bloco concluído ou pulado, oferecendo
                          estudar de novo o que já foi estudado — mesmo critério
                          do \"Pular\" abaixo. */}
                      {onStartBlock &&
                        (block.status === 'scheduled' || block.status === 'rescheduled') && ("""
assert velho in s, 'condicao Iniciar'

novo = """                      {/* \"Iniciar\" para o que ainda vai ser estudado. Some em
                          bloco concluído (já foi) e em bloco em andamento (já
                          começou) — antes aparecia nos dois, e o app convidava
                          a estudar de novo o que já estava estudado. Pulado
                          continua podendo iniciar: pular não é descarte. */}
                      {onStartBlock &&
                        block.status !== 'completed' &&
                        block.status !== 'in-progress' && ("""
s = s.replace(velho, novo, 1)
io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
print('ok: componente')

P2 = 'scripts/agenda-botoes.test.tsx'
s2 = io.open(P2, encoding='utf-8').read()
velho2 = """const pulado = botoes(bloco('mat', 'skipped'));
check('pulado: N\u00c3O oferece Iniciar', !pulado.iniciar);
check('pulado: N\u00c3O oferece Concluir', !pulado.concluir);
check('pulado: N\u00c3O oferece Pular de novo', !pulado.pular);"""
if velho2 not in s2:
    # tenta a variante sem escape
    velho2 = """const pulado = botoes(bloco('mat', 'skipped'));
check('pulado: NÃO oferece Iniciar', !pulado.iniciar);
check('pulado: NÃO oferece Concluir', !pulado.concluir);
check('pulado: NÃO oferece Pular de novo', !pulado.pular);"""
assert velho2 in s2, 'bloco pulado no teste'

novo2 = """// Pulado CONTINUA pendente (regra do app: pular nao e descarte), entao ainda
// da para iniciar e concluir — so nao da para pular duas vezes.
const pulado = botoes(bloco('mat', 'skipped'));
check('pulado: ainda oferece Iniciar', pulado.iniciar);
check('pulado: ainda oferece Concluir', pulado.concluir);
check('pulado: NAO oferece Pular de novo', !pulado.pular);"""
s2 = s2.replace(velho2, novo2, 1)
io.open(P2, 'w', encoding='utf-8', newline='\n').write(s2)
print('ok: teste')
