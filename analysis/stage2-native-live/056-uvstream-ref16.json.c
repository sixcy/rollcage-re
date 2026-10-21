
void FUN_00497300(void)

{
  short sVar1;
  short sVar2;
  short sVar3;
  short sVar4;
  short sVar5;
  short sVar6;
  short sVar7;
  undefined4 uVar8;
  int iVar9;
  undefined *puVar10;
  int in_ECX;
  int in_EDX;
  int iVar11;
  
  iVar11 = in_EDX * 0x20;
  sVar1 = *(short *)(in_ECX + 0x168);
  if ((*(uint *)(in_ECX + 0x168) & 0x1c30000) != 0) {
    sVar2 = *(short *)(iVar11 + 0x19c + in_ECX);
    sVar3 = *(short *)(iVar11 + 0x1ac + in_ECX);
    sVar4 = *(short *)(iVar11 + 0x1ae + in_ECX);
    sVar5 = *(short *)(iVar11 + 0x19e + in_ECX);
    sVar6 = *(short *)(iVar11 + 0x1b0 + in_ECX);
    sVar7 = *(short *)(iVar11 + 0x1a0 + in_ECX);
    if ((*(uint *)(in_ECX + 0x168) & 0xffff0000) == 0x10000) {
      if (sVar1 == 1) {
        puVar10 = *(undefined **)(&DAT_004f2d90 + *(int *)(in_ECX + 0x164) * 4);
      }
      else if (sVar1 == 3) {
        puVar10 = *(undefined **)(&DAT_004f2d64 + *(int *)(in_ECX + 0x164) * 4);
      }
      else {
        puVar10 = *(undefined **)(&DAT_004f2d38 + *(int *)(in_ECX + 0x164) * 4);
      }
    }
    else if ((sVar1 == 1) || (puVar10 = &DAT_0060a0f0, sVar1 == 3)) {
      puVar10 = &DAT_0070f040;
    }
    *(undefined **)(in_ECX + 0x198) = puVar10;
    FUN_00440f70();
    iVar11 = DAT_00626aa8;
    if (sVar1 == 3) {
      FUN_00441aa0(in_ECX + 0x69c,3,0x80000000,0);
    }
    else {
      uVar8 = *(undefined4 *)(in_ECX + 0x198);
      if (DAT_00626aa8 < 10) {
        iVar9 = DAT_00626aa8 * 0x130;
        DAT_00626aa8 = DAT_00626aa8 + 1;
        (&DAT_00626ab0)[iVar9] = 3;
        (&DAT_00626ab4)[iVar11 * 0x260] = (short)((int)sVar3 + (int)sVar2 >> 1);
        (&DAT_00626ab6)[iVar11 * 0x260] = (short)((int)sVar4 + (int)sVar5 >> 1);
        (&DAT_00626ab8)[iVar11 * 0x260] = (short)((int)sVar6 + (int)sVar7 >> 1);
        (&DAT_00626abc)[iVar11 * 0x130] = uVar8;
        return;
      }
    }
  }
  return;
}

