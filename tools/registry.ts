import type { JsonValue, ToolRequest } from "@/core/types";
import { generateFakePhoto } from "@/tools/generateFakePhoto";

export interface ToolExecution {
  ok: boolean;
  toolName: string;
  args: Record<string, JsonValue>;
  result: Record<string, JsonValue>;
  error: string | null;
}

export const TOOL_REGISTRY = {
  generate_fake_photo: {
    description: "生成一段明确标记为 mock 的内在世界图像描述，不调用真实图片 API。",
    cooldownHours: 4,
  },
} as const;

export async function executeTool(request: ToolRequest): Promise<ToolExecution> {
  if (request.name !== "generate_fake_photo") {
    return {
      ok: false,
      toolName: request.name,
      args: request.arguments,
      result: {},
      error: "Tool is not registered",
    };
  }
  try {
    const scene = typeof request.arguments.scene === "string" ? request.arguments.scene.trim() : "";
    const mood = typeof request.arguments.mood === "string" ? request.arguments.mood.trim() : "";
    const style = typeof request.arguments.style === "string" ? request.arguments.style.trim() : "";
    if (!scene) throw new Error("scene is required");
    const result = await generateFakePhoto({ scene, mood, style });
    return {
      ok: true,
      toolName: request.name,
      args: request.arguments,
      result: { type: result.type, description: result.description },
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      toolName: request.name,
      args: request.arguments,
      result: {},
      error: error instanceof Error ? error.message : "Tool execution failed",
    };
  }
}
