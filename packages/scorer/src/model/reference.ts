import type { ModelOutput, ModelScoreInput, ScoreModel } from "./types.js";

/** Sets every aiScore equal to the rubric value and leaves explanations empty. */
export class ReferenceModel implements ScoreModel {
  readonly id = "reference";

  async score(input: ModelScoreInput): Promise<ModelOutput> {
    return {
      components: input.rubric.map((component) => ({
        key: component.key,
        rubricScore: component.rubricScore,
        aiScore: component.rubricScore,
        explanation: "",
      })),
    };
  }
}
