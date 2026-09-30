/**
 * Controle de cadastros.
 *
 * O app vai virar assinatura, e até o banco em nuvem entrar não faz sentido
 * deixar gente se cadastrando na base local. Com `NEXT_PUBLIC_SIGNUPS_ENABLED`
 * desligado (padrão), o formulário de cadastro Some da tela e a rota de API
 * recusa criar conta.
 *
 * A variável é `NEXT_PUBLIC_` de propósito: cliente e servidor leem a MESMA
 * fonte, então a tela nunca mostra um formulário que a API iria recusar.
 *
 * Para ligar de novo (ex.: rodar os testes automatizados):
 *   NEXT_PUBLIC_SIGNUPS_ENABLED="true"  no .env.local
 */

const VALORES_LIGADOS = new Set(['1', 'true', 'yes', 'on', 'sim', 'ativo']);

/** True quando novas contas podem ser criadas. Padrão: desativado. */
export function signupsEnabled(): boolean {
  const bruto = (process.env.NEXT_PUBLIC_SIGNUPS_ENABLED ?? '').trim().toLowerCase();
  return VALORES_LIGADOS.has(bruto);
}

/** Mensagem exibida na tela de cadastro e devolvida pela API. */
export const SIGNUPS_DISABLED_MESSAGE =
  'Os cadastros estão temporariamente desativados. Em breve o Nexora abre turmas novas — por enquanto, use uma conta de teste para entrar.';

/** Resposta padrão da API quando os cadastros estão fechados. */
export const SIGNUPS_DISABLED_STATUS = 503;
