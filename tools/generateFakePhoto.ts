export interface FakePhotoArgs {
  scene: string;
  mood: string;
  style: string;
}

export interface FakePhotoResult {
  type: "mock_image";
  description: string;
}

export async function generateFakePhoto(args: FakePhotoArgs): Promise<FakePhotoResult> {
  return {
    type: "mock_image",
    description: `生成图片描述：${args.scene}；情绪：${args.mood || "克制"}；风格：${args.style || "像记忆，不像广告"}`,
  };
}
