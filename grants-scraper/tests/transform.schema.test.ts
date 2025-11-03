import { Opportunity } from "../src/transform/schema.js";
import { mapOpportunity } from "../src/transform/mapOpportunity.js";

describe("Transform schema", () => {
  it("should validate correct opportunity", () => {
    const raw = {
      id: "TEST-001",
      title: "Test Grant",
      postedDate: "2025-01-15T10:00:00Z",
      agency: "DOE",
    };

    const mapped = mapOpportunity(raw);
    const validated = Opportunity.parse(mapped);

    expect(validated.id).toBe("TEST-001");
    expect(validated.title).toBe("Test Grant");
    expect(validated.agency).toBe("DOE");
  });

  it("should reject opportunity without required fields", () => {
    const raw = {
      title: "Test Grant",
      // missing id and postedDate
    };

    expect(() => {
      const mapped = mapOpportunity(raw);
      Opportunity.parse(mapped);
    }).toThrow();
  });

  it("should handle comma-separated categories", () => {
    const raw = {
      id: "TEST-002",
      title: "Test Grant",
      postedDate: "2025-01-15T10:00:00Z",
      category: "Research, Energy, Technology",
    };

    const mapped = mapOpportunity(raw);
    expect(mapped.category).toEqual(["Research", "Energy", "Technology"]);
  });

  it("should handle null closeDate", () => {
    const raw = {
      id: "TEST-003",
      title: "Test Grant",
      postedDate: "2025-01-15T10:00:00Z",
      closeDate: null,
    };

    const mapped = mapOpportunity(raw);
    expect(mapped.closeDate).toBeNull();
  });
});

