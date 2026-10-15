import test from "node:test";
import assert from "node:assert/strict";
import { computeCustomerDebt } from "../src/utils/accounting.js";
import { normalizeName, normalizeUnit, applyInventoryDelta } from "../src/utils/inventoryOps.js";

test("customer debt includes received payments and cleared checks only", () => {
  const result = computeCustomerDebt({
    orders: [{ customerId: 1, total: 1200 }],
    finance: [
      { customerId: 1, type: "income", method: "نقد", amount: 200 },
      { customerId: 1, type: "income", method: "قسط", amount: 100 },
    ],
    checks: [
      { customerId: 1, status: "پاس شد", amount: 300 },
      { customerId: 1, status: "در انتظار", amount: 150 },
    ],
  }, 1);
  assert.deepEqual(result, { debt: 600, pendingChecks: 150 });
});

test("normalizeName handles Persian/Arabic letter variants and spacing", () => {
  assert.equal(normalizeName("  كالا   يک  "), "کالا یک");
  assert.equal(normalizeUnit(" "), "عدد");
});

test("inventory additions merge matching items and can be reversed", () => {
  const initial = [{ id: "a", name: "ورق", unit: "عدد", stock: 5 }];
  const added = applyInventoryDelta(initial, [{ name: "ورق", unit: "عدد", qty: 3 }], 1);
  assert.equal(added.inventory.length, 1);
  assert.equal(added.inventory[0].stock, 8);
  const removed = applyInventoryDelta(added.inventory, added.items, -1);
  assert.equal(removed.inventory[0].stock, 5);
  assert.equal(initial[0].stock, 5);
});
