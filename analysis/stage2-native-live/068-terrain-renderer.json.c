
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_0042ae20(void)

{
  ushort uVar1;
  undefined4 uVar2;
  undefined4 uVar3;
  undefined4 uVar4;
  undefined1 *puVar5;
  undefined4 *puVar6;
  undefined4 *puVar7;
  uint uVar8;
  int iVar9;
  
  uVar8 = *(uint *)(PTR_DAT_00513214 + 0x40) >> 1;
  _DAT_0079173c = DAT_00790f38 + (DAT_0062e488 & 0xfffffffc);
  DAT_0062e488 = DAT_0062e488 + uVar8 * 0x100;
  DAT_00791880 = uVar8 * 0x100 + _DAT_0079173c;
  DAT_00512fc8 = uVar8;
  DAT_007990dc = _DAT_0079173c;
  if (uVar8 != 0) {
    puVar5 = (undefined1 *)(_DAT_0079173c + 0x94);
    do {
      *puVar5 = 0;
      *(undefined2 *)(puVar5 + 2) = 0;
      puVar5[-0x7d] = 0x9a;
      *(undefined4 *)(puVar5 + -0x90) = 0;
      *(undefined4 *)(puVar5 + -0x94) = 9;
      *(undefined2 *)(puVar5 + -0x8c) = 0;
      *(undefined4 *)(puVar5 + -0x88) = 0;
      uVar8 = uVar8 - 1;
      puVar5 = puVar5 + 0x100;
    } while (uVar8 != 0);
  }
  iVar9 = 0xc;
  DAT_007990e8._2_2_ = 0xc00;
  DAT_007954a0._2_2_ = 0xc00;
  DAT_00791740._2_2_ = 0xc00;
  uVar1 = *(ushort *)(DAT_00791594 + 0x2e);
  DAT_007990ec._2_2_ = 0x600;
  DAT_00791738._2_2_ = 0xc00;
  DAT_007990f0._2_2_ = 0;
  DAT_007954a0._0_2_ = uVar1 + 0x32;
  DAT_007990c0._2_2_ = 0x100;
  DAT_00791738._0_2_ = uVar1 + 0x1a;
  DAT_007990ec._0_2_ = uVar1 + 0x26;
  DAT_007990f0._0_2_ = uVar1 + 0x43;
  DAT_007990c0._0_2_ = uVar1 + 0x94;
  puVar6 = (undefined4 *)((uVar1 + 0x32) * 0x10 + DAT_00791590);
  puVar7 = (undefined4 *)(DAT_00791570 * 0x10 + DAT_00791590);
  DAT_00791740._0_2_ = (short)DAT_00791738;
  DAT_007990e8._0_2_ = (short)DAT_007954a0;
  do {
    uVar2 = puVar6[1];
    uVar3 = puVar6[2];
    uVar4 = puVar6[3];
    *puVar7 = *puVar6;
    puVar7[1] = uVar2;
    puVar7[2] = uVar3;
    puVar7[3] = uVar4;
    *(ushort *)((int)puVar7 + 6) = *(ushort *)((int)puVar7 + 6) & 0x3f | 0x80;
    *(ushort *)((int)puVar6 + 6) = *(ushort *)((int)puVar6 + 6) | 0x800;
    iVar9 = iVar9 + -1;
    puVar6 = puVar6 + 4;
    puVar7 = puVar7 + 4;
  } while (iVar9 != 0);
  DAT_007990e0._0_2_ = (short)DAT_00791570;
  DAT_00791570 = DAT_00791570 + 0xc;
  DAT_007990e0._2_2_ = 0xc00;
  return;
}

