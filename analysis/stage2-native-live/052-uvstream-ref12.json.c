
void FUN_0048ac50(void)

{
  uint *puVar1;
  int iVar2;
  int iVar3;
  longlong lVar4;
  longlong lVar5;
  longlong lVar6;
  int iVar7;
  int iVar8;
  uint uVar9;
  int iVar10;
  byte bVar11;
  int in_ECX;
  int iVar12;
  int iVar13;
  int iVar14;
  int iVar15;
  int iVar16;
  
  puVar1 = *(uint **)(in_ECX + 0x17c);
  if (puVar1 != (uint *)0x0) {
    *(uint *)(in_ECX + 0x180) = puVar1[0xb];
    *(uint *)(in_ECX + 0x184) = puVar1[0xc];
    *(uint *)(in_ECX + 0x188) = puVar1[0xd];
    if ((*puVar1 & 0x1ff) == 3) {
      *(int *)(in_ECX + 0x184) = *(int *)(in_ECX + 0x184) + -0x200000;
    }
  }
  iVar8 = *(int *)(in_ECX + 0x180);
  iVar10 = *(int *)(in_ECX + 0x2c);
  iVar13 = *(int *)(in_ECX + 0x184);
  iVar16 = *(int *)(in_ECX + 0x30);
  iVar2 = *(int *)(in_ECX + 0x188);
  iVar3 = *(int *)(in_ECX + 0x34);
  iVar7 = FUN_0041b290();
  if (PTR_DAT_00513210[0x2c1] == '\x01') {
    iVar14 = 4;
    iVar15 = 4;
    iVar12 = 4;
  }
  else {
    iVar14 = 5;
    iVar15 = 5;
    iVar12 = 5;
  }
  iVar15 = iVar13 - iVar16 << iVar15;
  iVar14 = iVar8 - iVar10 << iVar14;
  iVar12 = iVar2 - iVar3 << iVar12;
  iVar14 = iVar14 + (iVar14 >> 2);
  iVar15 = iVar15 + (iVar15 >> 2);
  iVar12 = iVar12 + (iVar12 >> 2);
  if (((*(uint *)(in_ECX + 0x168) & 0x220000) != 0) &&
     (lVar4 = (longlong)iVar14 * (longlong)*(int *)(in_ECX + 0x38),
     lVar5 = (longlong)iVar15 * (longlong)*(int *)(in_ECX + 0x3c),
     lVar6 = (longlong)iVar12 * (longlong)*(int *)(in_ECX + 0x40),
     (int)(((uint)lVar6 >> 0x10 | (int)((ulonglong)lVar6 >> 0x20) << 0x10) +
          ((uint)lVar4 >> 0x10 | (int)((ulonglong)lVar4 >> 0x20) << 0x10) +
          ((uint)lVar5 >> 0x10 | (int)((ulonglong)lVar5 >> 0x20) << 0x10)) < 0)) {
    *(undefined4 *)(in_ECX + 0x164) = 0;
    *(undefined2 *)(in_ECX + 0x16a) = 8;
  }
  iVar7 = iVar7 >> 1;
  if (iVar7 < 5) {
    if ((*(uint *)(in_ECX + 0x168) & 0xffff0000) == 0x20000) {
      *(undefined4 *)(in_ECX + 0x164) = 0x20;
      *(undefined2 *)(in_ECX + 0x16a) = 0x20;
    }
    iVar7 = 1;
  }
  else if (2 < iVar7) {
    iVar7 = 2;
  }
  iVar8 = iVar7 * 0x2000 + 0xa000;
  lVar4 = (longlong)*(int *)(in_ECX + 0x38) * (longlong)iVar8;
  *(uint *)(in_ECX + 0x38) = (uint)lVar4 >> 0x10 | (int)((ulonglong)lVar4 >> 0x20) << 0x10;
  lVar4 = (longlong)*(int *)(in_ECX + 0x3c) * (longlong)iVar8;
  *(uint *)(in_ECX + 0x3c) = (uint)lVar4 >> 0x10 | (int)((ulonglong)lVar4 >> 0x20) << 0x10;
  lVar4 = (longlong)*(int *)(in_ECX + 0x40) * (longlong)iVar8;
  uVar9 = (uint)lVar4 >> 0x10 | (int)((ulonglong)lVar4 >> 0x20) << 0x10;
  *(uint *)(in_ECX + 0x40) = uVar9;
  iVar8 = iVar7 * 0x2000 + 0x9ff6;
  if (4 < iVar8) {
    iVar8 = 4;
  }
  if (*(short *)(in_ECX + 0x16a) == 1) {
    iVar8 = 0;
  }
  else {
    if (*(short *)(in_ECX + 0x16a) != 2) goto LAB_0048af0c;
    iVar10 = 3 - *(int *)(in_ECX + 0x164);
    if (0 < iVar10) {
      iVar8 = iVar8 - iVar10;
    }
    if (iVar8 < 0) goto LAB_0048af0c;
  }
  iVar10 = (int)((short)(&DAT_005132e0)
                        [(uint)*(byte *)(in_ECX + 0x16f) * 0x55 + *(int *)(in_ECX + 0x164) * 0x10 &
                         0xff] >> 2);
  iVar16 = *(short *)(in_ECX + 0xb2) * iVar10 >> 0xc;
  iVar13 = *(short *)(in_ECX + 0xac) * iVar10 >> 0xc;
  iVar10 = *(short *)(in_ECX + 0xb8) * iVar10 >> 0xc;
  if ((PTR_DAT_00513210[0x2c1] == '\x01') && (iVar8 = iVar8 + -1, iVar8 < 0)) {
    iVar14 = iVar14 + iVar13;
    iVar15 = iVar15 + iVar16;
    iVar12 = iVar12 + iVar10;
  }
  else {
    bVar11 = (byte)iVar8;
    iVar14 = iVar14 + (iVar13 << (bVar11 & 0x1f));
    iVar15 = iVar15 + (iVar16 << (bVar11 & 0x1f));
    iVar12 = iVar12 + (iVar10 << (bVar11 & 0x1f));
  }
LAB_0048af0c:
  *(int *)(in_ECX + 0x38) = *(int *)(in_ECX + 0x38) + iVar14;
  *(int *)(in_ECX + 0x3c) = *(int *)(in_ECX + 0x3c) + iVar15;
  iVar12 = iVar12 + uVar9;
  *(int *)(in_ECX + 0x40) = iVar12;
  *(undefined4 *)(in_ECX + 0x18c) = *(undefined4 *)(in_ECX + 0x38);
  *(undefined4 *)(in_ECX + 400) = *(undefined4 *)(in_ECX + 0x3c);
  *(int *)(in_ECX + 0x194) = iVar12;
  return;
}

