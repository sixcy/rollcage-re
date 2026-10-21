
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00413410(int param_1,uint param_2,byte param_3,undefined1 param_4,byte param_5)

{
  ushort uVar1;
  undefined4 uVar2;
  uint uVar3;
  undefined2 uVar4;
  undefined4 *puVar5;
  uint uVar6;
  int iVar7;
  byte bVar8;
  int in_ECX;
  int in_EDX;
  int iVar9;
  uint uVar10;
  int iVar11;
  int iVar12;
  int local_1c;
  int local_18;
  uint local_14;
  undefined4 local_10;
  int local_c;
  int local_8;
  
  DAT_0079dc64 = 0;
  puVar5 = (undefined4 *)
           ((param_5 + 0x51 + (uint)*(ushort *)(DAT_00791594 + 0x2e)) * 0x10 + DAT_00791590);
  uVar2 = *puVar5;
  local_10 = puVar5[1];
  uVar3 = puVar5[2];
  if (param_2 != 0) {
    local_14 = (uint)(param_3 >> 2);
    local_18 = (uint)param_3 * 5;
    local_c = in_EDX;
    local_8 = in_ECX;
    do {
      iVar11 = DAT_0079dc60 * 0x180 + DAT_0079dc50;
      if (*(char *)(iVar11 + 0x2c) != '\0') {
        FUN_00437be0();
      }
      *(undefined4 *)(iVar11 + 0xe4) = local_10;
      *(undefined4 *)(iVar11 + 0x6c) = local_10;
      *(undefined1 *)(iVar11 + 0x2d) = param_4;
      *(uint *)(iVar11 + 0x100) = uVar3;
      *(uint *)(iVar11 + 0x88) = uVar3;
      *(undefined4 *)(iVar11 + 200) = uVar2;
      *(undefined4 *)(iVar11 + 0x50) = uVar2;
      uVar6 = DAT_005131f4 * 0x41a7 & 0x7fffffff;
      *(undefined4 *)(iVar11 + 0xac) = 0x80c08080;
      *(undefined4 *)(iVar11 + 0x34) = 0x80c08080;
      _DAT_0079dc54 = uVar6 >> 0x10;
      *(uint *)(iVar11 + 0x11c) = uVar3 >> 0x10;
      *(uint *)(iVar11 + 0xa4) = uVar3 >> 0x10;
      *(undefined1 *)(iVar11 + 0x37) = 0x98;
      uVar6 = uVar6 * 0x41a7 & 0x7fffffff;
      *(undefined1 *)(iVar11 + 0xaf) = 0x98;
      _DAT_0079dc5c = uVar6 >> 0x10;
      DAT_005131f4 = uVar6 * 0x41a7 & 0x7fffffff;
      _DAT_0079dc58 = DAT_005131f4 >> 0x10;
      if (0x3fff < _DAT_0079dc54) {
        _DAT_0079dc54 = -_DAT_0079dc54;
      }
      if (0x3fff < _DAT_0079dc5c) {
        _DAT_0079dc5c = -_DAT_0079dc5c;
      }
      if (0x3fff < _DAT_0079dc58) {
        _DAT_0079dc58 = -_DAT_0079dc58;
      }
      bVar8 = (byte)local_14;
      iVar7 = (_DAT_0079dc58 << (bVar8 & 0x1f)) + param_1;
      iVar12 = (_DAT_0079dc54 << (bVar8 & 0x1f)) + local_8;
      iVar9 = (_DAT_0079dc5c << (bVar8 & 0x1f)) + local_c;
      *(int *)(iVar11 + 0x18) = iVar7;
      *(int *)(iVar11 + 0x10) = iVar12;
      uVar6 = iVar12 - local_8;
      *(int *)(iVar11 + 0x14) = iVar9;
      *(int *)(iVar11 + 0x24) = iVar7 - param_1;
      *(int *)(iVar11 + 0x20) = iVar9 - local_c;
      *(uint *)(iVar11 + 0x1c) = uVar6;
      if (((0x230000 < (int)((uVar6 ^ (int)uVar6 >> 0x1f) - ((int)uVar6 >> 0x1f))) ||
          (uVar10 = (int)*(uint *)(iVar11 + 0x20) >> 0x1f,
          0x230000 < (int)((*(uint *)(iVar11 + 0x20) ^ uVar10) - uVar10))) ||
         (uVar10 = (int)*(uint *)(iVar11 + 0x24) >> 0x1f,
         0x230000 < (int)((*(uint *)(iVar11 + 0x24) ^ uVar10) - uVar10))) {
        *(int *)(iVar11 + 0x20) = *(int *)(iVar11 + 0x20) >> 3;
        *(int *)(iVar11 + 0x24) = *(int *)(iVar11 + 0x24) >> 3;
        *(int *)(iVar11 + 0x1c) = (int)uVar6 >> 3;
      }
      iVar7 = FUN_00445500();
      if (iVar7 == 0) {
        *(undefined4 *)(iVar11 + 0x1c) = 0x10000;
        *(undefined4 *)(iVar11 + 0x20) = 0;
        *(undefined4 *)(iVar11 + 0x24) = 0;
      }
      else {
        FUN_00445490();
      }
      *(int *)(iVar11 + 0x28) = local_18;
      *(undefined2 *)(iVar11 + 0x2e) = 10;
      *(undefined1 *)(iVar11 + 0x2c) = 0xff;
      uVar6 = FUN_0041ea60(*(undefined4 *)(iVar11 + 0x18),&local_1c);
      iVar7 = DAT_00790f38;
      if (local_1c != 0) {
        uVar6 = uVar6 + 1;
      }
      *(uint *)(iVar11 + 0xc) = uVar6;
      uVar1 = *(ushort *)((uVar6 & 0xfffffffe) + 10);
      uVar4 = (undefined2)((iVar11 - iVar7) + 0x80U >> 7);
      if (uVar1 == 0) {
        *(undefined4 *)(iVar11 + 4) = 0;
      }
      else {
        *(uint *)(iVar11 + 4) = (uint)uVar1;
        *(undefined2 *)((uint)uVar1 * 0x80 + -0x7a + iVar7) = uVar4;
      }
      *(undefined2 *)((uVar6 & 0xfffffffe) + 10) = uVar4;
      DAT_0079dc60 = DAT_0079dc60 + 1;
      if (DAT_0079dc60 == 0x40) {
        DAT_0079dc60 = 0;
      }
      DAT_0079dc64 = DAT_0079dc64 + 1;
    } while (DAT_0079dc64 < param_2);
  }
  return;
}

