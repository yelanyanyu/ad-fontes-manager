import assert from 'node:assert/strict';
import { filterSortWords } from '../public/js/modules/list-sort.js';

const items = [
    { lemma: 'b', created_at: '2026-01-02T00:00:00.000Z' },
    { lemma: 'a', created_at: '2026-01-03T00:00:00.000Z' },
    { lemma: 'c', created_at: '2026-01-01T00:00:00.000Z' }
];

{
    const out = filterSortWords(items, '', 'az').map(x => x.lemma);
    assert.deepEqual(out, ['a', 'b', 'c']);
}

{
    const out = filterSortWords(items, '', 'za').map(x => x.lemma);
    assert.deepEqual(out, ['c', 'b', 'a']);
}

{
    const out = filterSortWords(items, '', 'newest').map(x => x.lemma);
    assert.deepEqual(out, ['a', 'b', 'c']);
}

{
    const out = filterSortWords(items, '', 'oldest').map(x => x.lemma);
    assert.deepEqual(out, ['c', 'b', 'a']);
}

{
    const out = filterSortWords(items, 'b', 'az').map(x => x.lemma);
    assert.deepEqual(out, ['b']);
}

console.log('test-list-sort ok');
