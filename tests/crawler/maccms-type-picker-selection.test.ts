import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileTypeIdsAfterLoad } from '../../components/admin/crawler/maccms-type-picker';

test('编辑页首次加载分类时保留已保存的空选择', () => {
  const selected = reconcileTypeIdsAfterLoad({
    selected: new Set(),
    availableTypeIds: [37, 59],
    suggestedTypeIds: [37],
    initialTypeIds: [],
    preserveCurrent: true,
  });
  assert.deepEqual([...selected], []);
});

test('编辑页首次加载分类时保留接口已不存在的历史分类 ID', () => {
  const selected = reconcileTypeIdsAfterLoad({
    selected: new Set([99]),
    availableTypeIds: [37, 59],
    suggestedTypeIds: [37],
    initialTypeIds: [99],
    preserveCurrent: true,
  });
  assert.deepEqual([...selected], [99]);
});

test('新建或切换来源时仍可采用接口建议分类', () => {
  const selected = reconcileTypeIdsAfterLoad({
    selected: new Set(),
    availableTypeIds: [37, 59],
    suggestedTypeIds: [37],
    initialTypeIds: [],
    preserveCurrent: false,
  });
  assert.deepEqual([...selected], [37]);
});
