import { DAOHAO_MAX, DAOHAO_MIN, QUIZ_EXTREME, QUIZ_QUESTIONS, QUIZ_SHANE_CLAMP, QUIZ_SHANE_PER_POINT, SHANE_MO, SHANE_ZHENG } from './config.ts';
import { type Gender, STARTER_GONGFA, STARTER_MO, STARTER_MO_LEAN, STARTER_ZHENG, WENXIN, type WenxinQuestion, XINGXIANG, type Xingxiang, type Xinxing } from './content.ts';
import { type Rng, pick, shuffle } from './rng.ts';

export function drawQuestions(rng: Rng, n = QUIZ_QUESTIONS): WenxinQuestion[] {
  return shuffle(rng, [...WENXIN]).slice(0, n);
}
export interface QuizResult {
  shan: number;
  gang: number;
  dong: number;
  qing: number;
  xinxing: Xinxing;
  renshe: string;
  shane: number;
  gongfa: string;
}

export function quizStart(shan: number): { shane: number; gongfa: string } {
  if (shan >= QUIZ_EXTREME) return { shane: SHANE_ZHENG, gongfa: STARTER_ZHENG.id };
  if (shan <= -QUIZ_EXTREME) return { shane: SHANE_MO, gongfa: STARTER_MO.id };
  const shane = Math.max(-QUIZ_SHANE_CLAMP, Math.min(QUIZ_SHANE_CLAMP, shan * QUIZ_SHANE_PER_POINT));
  return { shane, gongfa: shan < 0 ? STARTER_MO_LEAN.id : STARTER_GONGFA.id };
}

export function scoreQuiz(questions: WenxinQuestion[], answers: number[]): QuizResult {
  if (answers.length !== questions.length) throw new Error('answers length mismatch');
  let shan = 0;
  let gang = 0;
  let dong = 0;
  let qing = 0;
  questions.forEach((q, i) => {
    const o = q.options[answers[i] as number];
    if (!o) throw new Error(`bad answer for ${q.id}`);
    shan += o.shan;
    gang += o.gang;
    dong += o.dong ?? 0;
    qing += o.qing ?? 0;
  });
  const xinxing: Xinxing = shan >= 0 ? (gang >= 0 ? 'jian' : 'ren') : gang >= 0 ? 'kuang' : 'gui';
  const { shane, gongfa } = quizStart(shan);
  const renshe = `${xinxing}_${dong >= 0 ? 'dong' : 'jing'}_${qing >= 0 ? 'qing' : 'li'}`;
  return { shan, gang, dong, qing, xinxing, renshe, shane, gongfa };
}
export function pool(gender: Gender, xinxing: Xinxing): Xingxiang[] {
  return XINGXIANG.filter((x) => x.gender === gender && x.xinxing === xinxing);
}
const HAN = /^[一-鿿]+$/;
export function validDaohao(s: string): boolean {
  const t = s.trim();
  return HAN.test(t) && [...t].length >= DAOHAO_MIN && [...t].length <= DAOHAO_MAX;
}
const A = ['青', '玄', '紫', '白', '云', '寒', '清', '无', '太', '赤', '墨', '凌', '素', '长', '沧', '星'];
const B = ['云', '霄', '虚', '尘', '阳', '鹤', '风', '松', '岳', '溟', '霜', '烟', '渊', '川', '离', '璃'];
const C_M = ['子', '真人', '居士', '散人', '道人', '剑客', '上人', '客', ''];
const C_F = ['仙子', '真人', '居士', '散人', '娘子', '仙姑', '客', ''];
export function suggestDaohao(rng: Rng, taken: Set<string>, n = 4, gender: Gender = 'm'): string[] {
  const out = new Set<string>();
  const C = gender === 'f' ? C_F : C_M;
  for (let i = 0; out.size < n && i < 200; i++) {
    const s = pick(rng, A) + pick(rng, B) + pick(rng, C);
    if (!taken.has(s) && validDaohao(s)) out.add(s);
  }
  return [...out];
}
