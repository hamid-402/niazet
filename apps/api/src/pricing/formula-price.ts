import { BadRequestException } from '@nestjs/common';
import { calculatePrice, MAX_PRICE } from './pricing-calculation';
import type { PricingPriority } from './dto/calculate-price.dto';
import { readPolicyArray, readPolicyRecord } from './policy-json';

export const MAX_FORMULA_TERMS = 32;
export const MAX_FORMULA_QUANTITY = 1_000_000;

export interface LinearPriceFormula {
  type: 'linear-v1';
  version: number;
  currency: 'IRT';
  basePrice: number;
  maxBasePrice: number;
  terms: ReadonlyArray<{
    key: string;
    unitPrice: number;
    min: number;
    max: number;
  }>;
}

function invalid(): never {
  throw new BadRequestException('فرمول یا ورودی محاسبهٔ قیمت معتبر نیست.');
}

function keys(value: Record<string, unknown>, expected: readonly string[]) {
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length ||
    actual.some((key) => !expected.includes(key))
  )
    invalid();
}

function integer(value: unknown, min: number, max: number): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > max
  )
    invalid();
  return value;
}

export function readLinearPriceFormula(value: unknown): LinearPriceFormula {
  const formula = readPolicyRecord(value);
  keys(formula, [
    'type',
    'version',
    'currency',
    'basePrice',
    'maxBasePrice',
    'terms',
  ]);
  if (formula.type !== 'linear-v1' || formula.currency !== 'IRT') invalid();
  const version = integer(formula.version, 1, MAX_PRICE);
  const basePrice = integer(formula.basePrice, 0, MAX_PRICE);
  const maxBasePrice = integer(formula.maxBasePrice, basePrice, MAX_PRICE);
  const rawTerms = readPolicyArray(formula.terms, MAX_FORMULA_TERMS);
  const names = new Set<string>();
  let minimum = BigInt(basePrice);
  const terms = rawTerms.map((raw: unknown) => {
    const term = readPolicyRecord(raw);
    keys(term, ['key', 'unitPrice', 'min', 'max']);
    if (
      typeof term.key !== 'string' ||
      !/^[a-z][a-z0-9_]{0,63}$/.test(term.key) ||
      Object.hasOwn(Object.prototype, term.key) ||
      term.key === 'prototype' ||
      term.key === '__proto__' ||
      names.has(term.key)
    )
      invalid();
    names.add(term.key);
    const unitPrice = integer(term.unitPrice, 0, MAX_PRICE);
    const min = integer(term.min, 0, MAX_FORMULA_QUANTITY);
    const max = integer(term.max, min, MAX_FORMULA_QUANTITY);
    minimum += BigInt(unitPrice) * BigInt(min);
    return Object.freeze({ key: term.key, unitPrice, min, max });
  });
  if (minimum > BigInt(maxBasePrice)) invalid();
  return Object.freeze({
    type: 'linear-v1',
    version,
    currency: 'IRT',
    basePrice,
    maxBasePrice,
    terms: Object.freeze(terms),
  });
}

/** Pure calculation only. The caller must separately authorize/accept a quote. */
export function calculateFormulaPrice(
  value: unknown,
  rawInputs: unknown,
  priority: PricingPriority,
) {
  const formula = readLinearPriceFormula(value);
  const inputs = readPolicyRecord(rawInputs);
  keys(
    inputs,
    formula.terms.map((term) => term.key),
  );
  let total = BigInt(formula.basePrice);
  const snapshot: Record<string, number> = {};
  for (const term of formula.terms) {
    const quantity = integer(inputs[term.key], term.min, term.max);
    snapshot[term.key] = quantity;
    total += BigInt(term.unitPrice) * BigInt(quantity);
    if (total > BigInt(formula.maxBasePrice)) invalid();
  }
  return {
    ...calculatePrice(Number(total), priority),
    formula_snapshot: formula,
    inputs_snapshot: Object.freeze(snapshot),
  };
}
