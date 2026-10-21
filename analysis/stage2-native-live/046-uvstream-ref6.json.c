
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00484710(void)

{
  int *piVar1;
  int iVar2;
  bool bVar3;
  short sVar4;
  undefined4 uVar5;
  int in_ECX;
  uint uVar6;
  int iVar7;
  uint uVar8;
  int iVar9;
  int iVar10;
  int iVar11;
  uint local_10;
  
  iVar2 = *(int *)(in_ECX + 0x178);
  if (DAT_0060e2b4 == 1) {
    bVar3 = false;
  }
  else if ((PTR_DAT_00513210[0x2c1] == '\x01') && ((DAT_0076a324 & 1) != 0)) {
    bVar3 = false;
  }
  else {
    bVar3 = true;
  }
  *(uint *)(iVar2 + 0x180) = DAT_0076a324;
  if (*(int *)(iVar2 + 0x184) == 1) {
    if (bVar3) {
      piVar1 = (int *)(iVar2 + 0x188);
      *piVar1 = *piVar1 + -1;
      if (*piVar1 == 0) {
        uVar5 = FUN_00480260(iVar2 + 0x60);
        *(undefined4 *)(iVar2 + 0x19c) = uVar5;
        FUN_004802a0(0,*(undefined1 *)(*(int *)(iVar2 + 0x164) + 0x6b8));
        iVar9 = *(int *)(iVar2 + 0x164);
        if ((*(short *)(iVar9 + 0x724) != 0) &&
           ((*(byte *)(iVar9 + 0x72a) < 0xb || (*(byte *)(iVar9 + 0x72a) == 0)))) {
          *(undefined2 *)(iVar9 + 0x72a) = 0x10a;
          *(undefined2 *)(iVar9 + 0x722) = 0xff;
          *(undefined1 *)(iVar9 + 0x729) = 0x40;
        }
        *(undefined4 *)(iVar2 + 0x184) = 2;
      }
    }
    *(undefined2 *)(iVar2 + 0x19a) = *(undefined2 *)(&DAT_004f2c6c + *(int *)(iVar2 + 0x188) * 2);
    goto LAB_00484ba3;
  }
  if (*(int *)(iVar2 + 0x184) != 2) {
    return;
  }
  iVar9 = *(int *)(iVar2 + 0x188);
  if (900 < iVar9) {
    uVar6 = DAT_00791700 + 1;
    iVar9 = DAT_00791700 * 0xc;
    DAT_00791700 = -(uint)(uVar6 < 0x18) & uVar6;
    *(undefined4 *)(&DAT_00791760 + iVar9) = *(undefined4 *)(iVar2 + 0x2c);
    *(undefined4 *)(&DAT_00791764 + iVar9) = *(undefined4 *)(iVar2 + 0x30);
    *(undefined4 *)(&DAT_00791768 + iVar9) = *(undefined4 *)(iVar2 + 0x34);
    FUN_00480150(0,(int)DAT_0051801a,(int)DAT_0051801c,DAT_00518018,uVar6,0,0);
    FUN_0042b4e0(1,DAT_00791740,8);
    FUN_0042b9d0();
    FUN_0042b4e0(1,DAT_00791738,1);
    DAT_00799100 = *(undefined4 *)(iVar2 + 0x2c);
    DAT_00799104 = *(undefined4 *)(iVar2 + 0x30);
    DAT_00799108 = *(undefined4 *)(iVar2 + 0x34);
    DAT_00799110 = 1;
    DAT_0079910c = (uint)(PTR_DAT_00513210[0x2c1] == '\x01') * 8 + 8;
    FUN_0042bad0();
    if (DAT_006b1400 == 0) {
      _DAT_0079172c = *(undefined4 *)(iVar2 + 0x2c);
      _DAT_00791730 = *(undefined4 *)(iVar2 + 0x30);
      _DAT_00791734 = *(undefined4 *)(iVar2 + 0x34);
      _DAT_00791720 = 1;
      DAT_00791724 = 0x1f;
      _DAT_00791728 = 1;
    }
    FUN_0042d150();
    DAT_00626a80._0_2_ = *(undefined2 *)(iVar2 + 0x2e);
    DAT_00626a80._2_2_ = *(undefined2 *)(iVar2 + 0x32);
    DAT_00626a84._0_2_ = *(undefined2 *)(iVar2 + 0x36);
    DAT_00626a8c = 1;
    FUN_0042b4e0(1,DAT_007990c0,0x4000);
    FUN_00485a10();
    return;
  }
  if (bVar3) {
    if (iVar9 < 6) {
      if (iVar9 == 0) {
        *(short *)(iVar2 + 0x198) = *(short *)(iVar2 + 0x198) + 1;
      }
      else {
        *(short *)(iVar2 + 0x198) = *(short *)(iVar2 + 0x198) + (1 << ((char)iVar9 - 1U & 0x1f));
      }
    }
    else {
      *(short *)(iVar2 + 0x198) = *(short *)(iVar2 + 0x198) + 0x20;
    }
    *(short *)(iVar2 + 0x1ba) = *(short *)(iVar2 + 0x1ba) + 1;
    *(undefined1 *)(iVar2 + 0x199) = 0;
    *(int *)(iVar2 + 0x188) = iVar9 + 1;
  }
  if ((100 < *(short *)(iVar2 + 0x19a)) &&
     (sVar4 = *(short *)(iVar2 + 0x19a) + -10, *(short *)(iVar2 + 0x19a) = sVar4, sVar4 < 100)) {
    *(undefined2 *)(iVar2 + 0x19a) = 100;
  }
  if (*(int *)(iVar2 + 0x188) < 0x1e) {
    uVar6 = *(uint *)(iVar2 + 0x38);
    local_10 = *(uint *)(iVar2 + 0x40);
    uVar8 = (int)*(uint *)(iVar2 + 0x3c) >> 0x1f;
    iVar9 = *(int *)(iVar2 + 0x3c);
    if ((int)((local_10 ^ (int)local_10 >> 0x1f) - ((int)local_10 >> 0x1f) |
              (*(uint *)(iVar2 + 0x3c) ^ uVar8) - uVar8 |
             (uVar6 ^ (int)uVar6 >> 0x1f) - ((int)uVar6 >> 0x1f)) < 0x1001) {
      uVar8 = *(uint *)(iVar2 + 0x40);
    }
    else {
      uVar6 = ((int)uVar6 >> 1) + ((int)uVar6 >> 4) + ((int)uVar6 >> 3) + ((int)uVar6 >> 2);
      iVar9 = (iVar9 >> 1) + (iVar9 >> 4) + (iVar9 >> 3) + (iVar9 >> 2);
      uVar8 = (*(int *)(iVar2 + 0x40) >> 1) +
              (*(int *)(iVar2 + 0x40) >> 4) + (*(int *)(iVar2 + 0x40) >> 3) +
              (*(int *)(iVar2 + 0x40) >> 2);
      local_10 = uVar8;
    }
    if ((*(int *)(iVar2 + 0x188) == 1) && ((*(byte *)(iVar2 + 0x1a8) & 1) != 0)) {
      *(uint *)(iVar2 + 0x38) = *(int *)(iVar2 + 0x18c) * 0x20 + uVar6;
      *(int *)(iVar2 + 0x3c) = *(int *)(iVar2 + 400) * 0x20 + iVar9;
      *(uint *)(iVar2 + 0x40) = *(int *)(iVar2 + 0x194) * 0x20 + uVar8;
    }
    else {
      *(uint *)(iVar2 + 0x38) = *(int *)(iVar2 + 0x18c) + uVar6;
      *(int *)(iVar2 + 0x3c) = *(int *)(iVar2 + 400) + iVar9;
      *(uint *)(iVar2 + 0x40) = local_10 + *(int *)(iVar2 + 0x194);
    }
  }
  else {
    iVar11 = *(int *)(iVar2 + 0x40) >> 0x10;
    iVar10 = *(int *)(iVar2 + 0x3c) >> 0x10;
    iVar7 = *(int *)(iVar2 + 0x38) >> 0x10;
    iVar9 = iVar11 * iVar11 + iVar10 * iVar10 + iVar7 * iVar7;
    if (iVar9 < 0x32) {
      iVar7 = iVar7 << 0xc;
      iVar10 = iVar10 << 0xc;
      iVar11 = iVar11 << 0xc;
    }
    else if (iVar9 < 100) {
      iVar7 = iVar7 << 0xb;
      iVar10 = iVar10 << 0xb;
      iVar11 = iVar11 << 0xb;
    }
    else {
      if (0x95 < iVar9) goto LAB_00484aca;
      iVar7 = iVar7 << 10;
      iVar10 = iVar10 << 10;
      iVar11 = iVar11 << 10;
    }
    *(int *)(iVar2 + 0x38) = *(int *)(iVar2 + 0x38) + iVar7;
    *(int *)(iVar2 + 0x3c) = *(int *)(iVar2 + 0x3c) + iVar10;
    *(int *)(iVar2 + 0x40) = *(int *)(iVar2 + 0x40) + iVar11;
  }
LAB_00484aca:
  if (0x1d < *(short *)(iVar2 + 0x1ba)) {
    *(undefined4 *)(iVar2 + 0x1a0) = 0;
    *(undefined4 *)(iVar2 + 0x1a4) = 0;
    *(undefined2 *)(iVar2 + 0x1ba) = 0;
    FUN_00485770();
    return;
  }
LAB_00484ba3:
  FUN_00485770();
  return;
}

