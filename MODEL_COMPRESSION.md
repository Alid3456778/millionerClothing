# Model Compression Workflow

This project is set up to use compressed `.glb` files directly from `model/`.

## Install the CLI

Use the official glTF Transform CLI:

```bash
npm install --save-dev @gltf-transform/cli
```

Official references:
- https://gltf-transform.dev/
- https://www.npmjs.com/package/@gltf-transform/cli

## Compress one model

From `claud/`:

```bash
npm run models:compress:one -- -InputPath source-models/Pants.glb -OutputPath model/Pants.glb
```

This script runs the official commands in sequence:

```bash
gltf-transform optimize input.glb output.glb --texture-compress webp
gltf-transform draco input.glb output.glb --method edgebreaker
```

The compressed result should be written to `model/` so the storefront uses it directly.

## Compress all models

```bash
npm run models:compress:all
```

The helper script reads original files from `source-models/` and writes compressed files into `model/`.

## Test the result

After compressing a model into `model/`, reload the homepage. No code change is required as long as the filename stays the same.

## Suggested rollout

1. Keep a backup of your original source models outside the app, for example in `source-models/`.
2. Compress `Pants.glb` first.
3. Compare visual quality and loading speed.
4. Replace only the heaviest models first, especially watches and oversized garments.
