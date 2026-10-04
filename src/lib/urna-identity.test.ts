import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractUrnaIdFromRaw,
  sameUrnaAlreadyIngested,
} from "./urna-identity";

describe("sameUrnaAlreadyIngested", () => {
  const rows = [
    { zona: "383", secao: "0401", urna_id: "77" },
    { zona: "383", secao: "0401", urna_id: "77" },
  ];

  it("allows a second BU in the same seção when IDUE differs", () => {
    assert.equal(sameUrnaAlreadyIngested(rows, "383", "0401", "99"), false);
    assert.equal(sameUrnaAlreadyIngested(rows, "0383", "401", "99"), false);
  });

  it("blocks only the same urna (zona + seção + IDUE)", () => {
    assert.equal(sameUrnaAlreadyIngested(rows, "383", "0401", "77"), true);
  });

  it("without IDUE only blocks rows that also have no IDUE", () => {
    assert.equal(sameUrnaAlreadyIngested(rows, "383", "0401", null), false);
    const legacy = [{ zona: "247", secao: "0123", urna_id: null }];
    assert.equal(sameUrnaAlreadyIngested(legacy, "247", "0123", null), true);
    assert.equal(sameUrnaAlreadyIngested(legacy, "247", "0123", "11"), false);
  });

  it("reads IDUE from raw TSE text", () => {
    assert.equal(extractUrnaIdFromRaw("SEQL:01/04 IDUE:1760649 ZONA:383"), "1760649");
    assert.equal(extractUrnaIdFromRaw("NR_UE:88 CARG:1"), "88");
    assert.equal(extractUrnaIdFromRaw("no urna"), null);
  });
});
