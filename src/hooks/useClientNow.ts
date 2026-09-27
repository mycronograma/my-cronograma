'use client';

import { useEffect, useState } from 'react';

/**
 * Retorna a data/hora atual somente após a hidratação (no cliente).
 *
 * O servidor (UTC) e o navegador (fuso do usuário) podem discordar sobre
 * "hoje" — principalmente perto da meia-noite — e qualquer texto ou lista
 * derivada de `new Date()` durante a renderização quebra a hidratação do
 * React ("Text content does not match server-rendered HTML"). Renderizar um
 * placeholder neutro até o mount garante HTML do servidor === primeira
 * renderização do client; o effect então corrige tudo para o fuso real.
 */
export const useClientNow = (): Date | null => {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  return now;
};
