<?php
declare(strict_types=1);

function validate_game(object $game): void
{
    $schema = json_decode(file_get_contents(__DIR__ . '/game.schema.json'));
    $validator = new Opis\JsonSchema\Validator();
    if (!$validator->validate($game, $schema)->isValid()) {
        fail(422, 'The game does not match the game format. Check Structure & rules.');
    }
    $groups = ['assets', 'stats', 'flags', 'cards', 'decks', 'chapters', 'endings'];
    $maps = [];
    foreach ($groups as $group) {
        $maps[$group] = [];
        foreach ($game->$group as $entry) {
            if (isset($maps[$group][$entry->id])) fail(422, "Duplicate ID in $group");
            $maps[$group][$entry->id] = $entry;
        }
    }
    if (count($game->cards) > 2000 || count($game->assets) > 200) fail(422, 'Project limit: 2,000 cards and 200 assets.');
    $refs = ['statId'=>'stats','flagId'=>'flags','cardId'=>'cards','followUpCardId'=>'cards',
        'deckId'=>'decks','toChapterId'=>'chapters','startChapterId'=>'chapters','fallbackEndingId'=>'endings',
        'imageAssetId'=>'assets','iconAssetId'=>'assets','backgroundAssetId'=>'assets','fontAssetId'=>'assets'];
    $walk = function ($value) use (&$walk, $maps, $refs) {
        if (!is_object($value) && !is_array($value)) return;
        foreach ($value as $key=>$child) {
            if (isset($refs[$key])) {
                $target = $maps[$refs[$key]][$child] ?? null;
                if (!$target) fail(422, "Unknown reference: $key");
                if ($refs[$key] === 'assets' && $target->kind !== ($key === 'fontAssetId' ? 'font' : 'image')) fail(422, 'Asset kind mismatch.');
            }
            $walk($child);
        }
    };
    $walk($game);
    foreach ($game->stats as $stat) {
        if ($stat->min >= $stat->max || $stat->initial < $stat->min || $stat->initial > $stat->max) fail(422, 'Invalid stat range.');
    }
    $paths = [];
    foreach ($game->assets as $asset) {
        if (isset($paths[$asset->path])) fail(422, 'Duplicate asset path.');
        $paths[$asset->path] = true;
        if (!(($asset->kind === 'image' && preg_match('/\.(png|jpe?g|webp)$/D', $asset->path)) ||
              ($asset->kind === 'font' && str_ends_with($asset->path, '.woff2')))) fail(422, 'Supported assets: PNG, JPEG, WebP and WOFF2.');
    }
    foreach ($game->decks as $deck) {
        if (count(array_unique(array_column($deck->cards, 'cardId'))) !== count($deck->cards)) fail(422, 'Duplicate card in a deck.');
        foreach ($deck->cards as $entry) if ($deck->mode === 'ordered' && $entry->weight !== 1) fail(422, 'Ordered deck weights must be 1.');
    }
    foreach ($game->chapters as $chapter) {
        if (count(array_unique(array_column($chapter->decks, 'deckId'))) !== count($chapter->decks)) fail(422, 'Duplicate deck in a chapter.');
    }
    $priorities = [];
    foreach ($game->endings as $ending) {
        if (isset($priorities[$ending->priority])) fail(422, 'Ending priorities must be unique.');
        $priorities[$ending->priority] = true;
        if (($ending->id === $game->fallbackEndingId) === isset($ending->when)) fail(422, 'Invalid fallback ending.');
    }
}

function decode_images(object $game, object $images): array
{
    $result = []; $total = 0;
    foreach ($game->assets as $asset) {
        $data = $images->{$asset->id} ?? '';
        if ($asset->kind === 'font') {
            // Older browser uploads sometimes use an empty or generic MIME type.
            if (!is_string($data) || !preg_match('~^data:(?:font/woff2|application/(?:octet-stream|font-woff2)|);base64,([A-Za-z0-9+/=\r\n]+)$~D', $data, $font)) fail(422, 'Missing or unsupported font: ' . $asset->id);
            $bytes = base64_decode($font[1], true);
            if ($bytes === false || strlen($bytes) < 48 || strlen($bytes) > 2000000 || substr($bytes, 0, 4) !== 'wOF2') fail(422, 'Invalid WOFF2 font or font exceeds 2 MB.');
            $header = unpack('Nlength/ntables/nreserved/Nexpanded/Ncompressed', substr($bytes, 8, 16));
            if ($header['length'] !== strlen($bytes) || !$header['tables'] || $header['reserved'] !== 0 || $header['expanded'] > 50000000 || !$header['compressed'] || $header['compressed'] > strlen($bytes) - 48) fail(422, 'Invalid WOFF2 header.');
            $total += strlen($bytes);
            if ($total > 10000000) fail(422, 'Project assets exceed the 10 MB shared-project limit.');
            $result[$asset->id] = ['bytes'=>$bytes,'mime'=>'font/woff2','hash'=>hash('sha256',$bytes),'filename'=>basename($asset->path)];
            continue;
        }
        if (!is_string($data) || !preg_match('~^data:image/(png|jpeg|webp);base64,([A-Za-z0-9+/=\r\n]+)$~D', $data, $match)) fail(422, 'Missing or unsupported image: ' . $asset->id);
        $bytes = base64_decode($match[2], true);
        if ($bytes === false || strlen($bytes) > 5000000) fail(422, 'An image exceeds 5 MB.');
        $total += strlen($bytes);
        if ($total > 10000000) fail(422, 'Project images exceed the 10 MB shared-project limit.');
        $info = @getimagesizefromstring($bytes);
        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        $ext = strtolower(pathinfo($asset->path, PATHINFO_EXTENSION));
        $expected = ['png'=>'image/png','jpg'=>'image/jpeg','jpeg'=>'image/jpeg','webp'=>'image/webp'][$ext] ?? '';
        if (!$info || $mime !== $expected || $mime !== 'image/'.$match[1] || $info[0]*$info[1] > 16000000) fail(422, 'Image format or dimensions are invalid.');
        $result[$asset->id] = ['bytes'=>$bytes,'mime'=>$mime,'hash'=>hash('sha256',$bytes),'filename'=>basename($asset->path)];
    }
    return $result;
}
