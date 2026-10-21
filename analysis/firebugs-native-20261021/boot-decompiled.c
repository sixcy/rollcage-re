
// FUNCTION 80020828 FUN_80020828 [[80020828, 8002082f]]

void FUN_80020828(void)

{
  return;
}



// FUNCTION 80020870 FUN_80020870 [[80020870, 8002089b]]

void FUN_80020870(code *param_1)

{
  (*param_1)();
  return;
}



// FUNCTION 80020a4c FUN_80020a4c [[80020a4c, 80020ad7]]

void FUN_80020a4c(undefined4 param_1,int param_2)

{
  undefined4 uVar1;
  int iVar2;
  undefined1 auStack_28 [24];
  
  FUN_80025a8c(auStack_28,s__IDX_IDXFILES_IDX_1_80020000);
  uVar1 = FUN_8002680c(auStack_28);
  FUN_8002688c(uVar1,auStack_28);
  FUN_800263fc(2,auStack_28,0);
  FUN_8002279c(param_2 + 0x7ffU >> 0xb,param_1,0x80);
  do {
    iVar2 = FUN_80022938(1,0);
  } while (iVar2 != 0);
  return;
}



// FUNCTION 80020ad8 FUN_80020ad8 [[80020ad8, 80020b6f]]

void FUN_80020ad8(undefined4 param_1,uint param_2,int param_3)

{
  int iVar1;
  undefined1 auStack_28 [24];
  
  FUN_80025a8c(auStack_28,s__IDX_IDXFILES_IMG_1_80020014);
  iVar1 = FUN_8002680c(auStack_28);
  FUN_8002688c(iVar1 + (param_2 >> 0xb),auStack_28);
  FUN_800263fc(2,auStack_28,0);
  FUN_8002279c(param_3 + 0x7ffU >> 0xb,param_1,0x80);
  do {
    iVar1 = FUN_80022938(1,0);
  } while (iVar1 != 0);
  return;
}



// FUNCTION 80020b70 FUN_80020b70 [[80020b70, 80020d37]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_80020b70(void)

{
  undefined4 local_20;
  undefined4 local_1c;
  
  local_20 = DAT_8002afdc;
  local_1c = DAT_8002afe0;
  FUN_800267dc(1);
  FUN_80026c9c(0x8002b048,0,0,0x200,0x100);
  FUN_800269cc(&DAT_8002afec,0,0x100,0x200,0x100);
  FUN_80026c9c(0x8002b0b8,0,0x100,0x200,0x100);
  FUN_800269cc(0x8002b05c,0,0,0x200,0x100);
  _DAT_8002b050 = 0;
  _DAT_8002b0c0 = 0;
  _DAT_8002b052 = 0xf;
  _DAT_8002b0c2 = 0xf;
  _DAT_8002b054 = 0x200;
  _DAT_8002b0c4 = 0x200;
  _DAT_8002b056 = 0x100;
  _DAT_8002b0c6 = 0x100;
  FUN_80022db8(0);
  FUN_80022f3c(&local_20,0,0,0);
  FUN_80022db8(0);
  local_20 = CONCAT22(local_20._2_2_ + 0x100,(undefined2)local_20);
  FUN_80022f3c(&local_20,0,0,0);
  FUN_80022db8(0);
  local_20._2_2_ = 0;
  local_20._0_2_ = 0x200;
  FUN_80022f3c(&local_20,0,0,0);
  FUN_80022db8(0);
  local_20 = CONCAT22(local_20._2_2_ + 0x100,(undefined2)local_20);
  FUN_80022f3c(&local_20,0,0,0);
  FUN_80022db8(0);
  FUN_80026a8c(0);
  FUN_800235e8(0x8002b048);
  FUN_8002341c(&DAT_8002afec);
  FUN_80026a8c(0);
  FUN_80026a8c(0);
  FUN_80026a8c(0);
  return;
}



// FUNCTION 80020d38 FUN_80020d38 [[80020d38, 8002103f]]

undefined4 FUN_80020d38(void)

{
  int iVar1;
  undefined4 uVar2;
  int iVar3;
  uint uVar4;
  undefined4 *puVar5;
  undefined4 *puVar6;
  int *unaff_gp;
  
  FUN_80020828();
  uVar4 = 0;
  puVar6 = (undefined4 *)&DAT_80019800;
  *(undefined4 *)(unaff_gp[1] + 0x1720) = DAT_80029740;
  FUN_800219dc();
  FUN_800219cc();
  FUN_800269bc(0x80200000);
  FUN_800267cc();
  FUN_80022d20(0);
  FUN_80022a3c(0);
  FUN_80022d20(1);
  FUN_80020b70();
  FUN_80021718();
  FUN_80021478(1,0x28,200,0x6e,2,0x300,0,0xff,0,0x40,0x80,0x40);
  FUN_80021478(0,0x16a,200,0x6e,2,0x300,0xff,0,0,0x80,0x40,0x40);
  FUN_80021040(1);
  iVar1 = unaff_gp[1];
  puVar5 = (undefined4 *)&DAT_80018000;
  *(undefined2 *)(iVar1 + 0x129a) = 0;
  *(undefined2 *)(iVar1 + 0x1298) = 0;
  FUN_8002699c();
  FUN_8002593c();
  FUN_800267bc(unaff_gp[1],0,0x1730);
  do {
    *puVar5 = 0;
    *puVar6 = 0;
    if ((uVar4 & 2) != 0) {
      FUN_8002122c(0);
      FUN_8002122c(1);
    }
    if ((uVar4 & 0x1f) == 0xf) {
      FUN_80022db8(0);
      FUN_80026a8c(0);
    }
    puVar6 = puVar6 + 1;
    uVar4 = uVar4 + 1;
    puVar5 = puVar5 + 1;
  } while (uVar4 < 0x600);
  FUN_80021040(0);
  uVar4 = 0;
  puVar5 = (undefined4 *)&DAT_8002b0cc;
  iVar1 = unaff_gp[1];
  do {
    uVar2 = *puVar5;
    puVar5 = puVar5 + 1;
    uVar4 = uVar4 + 1;
    *(undefined4 *)(iVar1 + 0x16e0) = uVar2;
    iVar1 = iVar1 + 4;
  } while (uVar4 < 0x10);
  *(undefined4 *)(unaff_gp[1] + 0x1724) = 0;
  FUN_80020a4c(&DAT_80018000,0xe50);
  *(undefined1 *)(unaff_gp[1] + 0x240) = 2;
  *(undefined1 *)(unaff_gp[1] + 0x242) = 0xb;
  iVar3 = unaff_gp[1];
  *(undefined1 *)(iVar3 + 0x234) = 2;
  iVar1 = unaff_gp[1];
  *(undefined4 *)(iVar3 + 0x21c) = 0x8016326c;
  *(undefined4 *)(iVar3 + 0x220) = 0x801b4860;
  *(undefined1 *)(iVar1 + 0x235) = 0;
  iVar3 = unaff_gp[1];
  *(undefined4 *)(iVar1 + 0x224) = 0x800955ac;
  *(undefined4 *)(iVar1 + 0x228) = 0x800aefa4;
  *(undefined4 *)(iVar3 + 0x22c) = 0x800955ac;
  *(undefined4 *)(iVar3 + 0x230) = 0x800aefa4;
  *(undefined1 *)(iVar3 + 0x236) = 1;
  *(undefined1 *)(unaff_gp[1] + 0x654) = 0x80;
  iVar1 = unaff_gp[1];
  *(undefined2 *)(iVar1 + 0x129a) = 0xf;
  *(undefined2 *)(iVar1 + 0x128a) = 0x32f0;
  *(undefined2 *)(iVar1 + 0x1288) = 0x32f0;
  *(undefined2 *)(iVar1 + 0x1298) = 0;
  *(undefined2 *)(iVar1 + 0x658) = 0;
  puVar5 = (undefined4 *)((uint)*(byte *)(iVar1 + 0x234) * 0x10 + *unaff_gp);
  FUN_80020ad8(0x80160000,*puVar5,puVar5[1]);
  FUN_80022db8(0);
  FUN_80026a8c(0);
  FUN_80022db8(0);
  FUN_80026a8c(0);
  FUN_80021ad0();
  FUN_800219cc();
  FUN_80020870(*(undefined4 *)(unaff_gp[1] + 0x21c),*(undefined4 *)(unaff_gp[1] + 0x220));
  return 0;
}



// FUNCTION 80021040 FUN_80021040 [[80021040, 8002104b]]

void FUN_80021040(undefined4 param_1)

{
  int unaff_gp;
  
  *(undefined4 *)(unaff_gp + 0x10) = param_1;
  return;
}



// FUNCTION 8002104c FUN_8002104c [[8002104c, 80021057]]

bool FUN_8002104c(uint param_1)

{
  return 3 < param_1;
}



// FUNCTION 80021058 FUN_80021058 [[80021058, 8002122b]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_80021058(int param_1)

{
  int iVar1;
  short *psVar2;
  short *psVar3;
  int iVar4;
  int iVar5;
  short local_48 [8];
  short local_38 [8];
  short local_28 [8];
  
  iVar1 = param_1 * 0x3c;
  psVar2 = (short *)(&DAT_8002b10c + iVar1);
  iVar4 = 0;
  iVar5 = *(int *)(&DAT_8002b120 + iVar1);
  psVar3 = local_48;
  do {
    *psVar3 = *psVar2 + -2;
    psVar3[1] = *(short *)(&DAT_8002b110 + iVar1) + ((ushort)iVar4 & 1) * 0x100 + -2;
    psVar3[2] = *(short *)(&DAT_8002b114 + iVar1) + 4;
    iVar4 = iVar4 + 1;
    psVar3[3] = *(short *)(&DAT_8002b118 + iVar1) + 4;
    FUN_80022f3c(psVar3,*(undefined1 *)(iVar1 + -0x7ffd4ebd),*(undefined1 *)(iVar1 + -0x7ffd4ebc),
                 *(undefined1 *)(iVar1 + -0x7ffd4ebb));
    psVar3 = psVar3 + 4;
  } while (iVar4 < 2);
  iVar4 = 2;
  psVar3 = local_38;
  do {
    *psVar3 = *psVar2;
    psVar3[1] = *(short *)(&DAT_8002b110 + iVar1) + ((ushort)iVar4 & 1) * 0x100;
    psVar3[2] = *(short *)(&DAT_8002b114 + iVar1);
    iVar4 = iVar4 + 1;
    psVar3[3] = *(short *)(&DAT_8002b118 + iVar1);
    FUN_80022f3c(psVar3,0,0,0);
    psVar3 = psVar3 + 4;
  } while (iVar4 < 4);
  iVar4 = 4;
  psVar3 = local_28;
  do {
    if (param_1 == 1) {
      *psVar3 = (_DAT_8002b148 + _DAT_8002b150) - (short)((uint)(iVar5 * iRam8002b160) >> 0x10);
    }
    else {
      *psVar3 = *psVar2;
    }
    psVar3[1] = *(short *)(&DAT_8002b110 + iVar1) + ((ushort)iVar4 & 1) * 0x100;
    psVar3[2] = (short)((uint)(iVar5 * *(int *)(iVar1 + -0x7ffd4edc)) >> 0x10);
    psVar3[3] = *(short *)(&DAT_8002b118 + iVar1);
    iVar4 = iVar4 + 1;
    FUN_80022f3c(psVar3,*(undefined1 *)(iVar1 + -0x7ffd4ec0),*(undefined1 *)(iVar1 + -0x7ffd4ebf),
                 *(undefined1 *)(iVar1 + -0x7ffd4ebe));
    psVar3 = psVar3 + 4;
  } while (iVar4 < 6);
  return;
}



// FUNCTION 8002122c FUN_8002122c [[8002122c, 800212ab]]

void FUN_8002122c(int param_1)

{
  int iVar1;
  int iVar2;
  int iVar3;
  int unaff_gp;
  
  iVar1 = FUN_8002104c(param_1,0);
  if (iVar1 == 0) {
    iVar1 = param_1 * 0x3c;
    if (((*(int *)(&DAT_8002b120 + iVar1) != -1) &&
        (iVar3 = *(int *)(&DAT_8002b120 + iVar1) + 1, iVar3 <= *(int *)(&DAT_8002b11c + iVar1))) &&
       (iVar2 = *(int *)(unaff_gp + 0x10), *(int *)(&DAT_8002b120 + iVar1) = iVar3, iVar2 != 0)) {
      FUN_80021058(param_1);
    }
  }
  return;
}



// FUNCTION 800212ac FUN_800212ac [[800212ac, 80021383]]

void FUN_800212ac(int param_1,uint param_2)

{
  int iVar1;
  int iVar2;
  
  iVar1 = FUN_8002104c(param_1,1);
  if ((iVar1 == 0) && (param_2 < 0x65)) {
    iVar1 = param_1 * 0x3c;
    if (*(int *)(&DAT_8002b11c + iVar1) != -1) {
      iVar2 = (*(int *)(&DAT_8002b11c + iVar1) - *(int *)(&DAT_8002b120 + iVar1)) * 100;
      if (param_2 == 0) {
        trap(0x1c00);
      }
      if ((param_2 == 0xffffffff) && (iVar2 == -0x80000000)) {
        trap(0x1800);
      }
      iVar2 = *(int *)(&DAT_8002b120 + iVar1) + iVar2 / (int)param_2;
      *(int *)(&DAT_8002b120 + iVar1) = iVar2;
      if (*(int *)(&DAT_8002b11c + iVar1) <= iVar2) {
        *(int *)(&DAT_8002b120 + iVar1) = *(int *)(&DAT_8002b11c + iVar1) + -1;
      }
      FUN_8002122c(param_1);
    }
  }
  return;
}



// FUNCTION 80021384 FUN_80021384 [[80021384, 80021477]]

void FUN_80021384(int param_1,int param_2)

{
  int iVar1;
  int iVar2;
  int iVar3;
  int iVar4;
  
  iVar1 = FUN_8002104c(param_1,4);
  if (iVar1 == 0) {
    param_1 = param_1 * 0x3c;
    iVar1 = param_2 + -1;
    if (*(int *)(&DAT_8002b11c + param_1) != -1) {
      iVar3 = *(int *)(&DAT_8002b120 + param_1) * *(int *)(param_1 + -0x7ffd4edc) >> 0x10;
      iVar2 = (*(int *)(&DAT_8002b114 + param_1) - iVar3) * 0x10000;
      iVar4 = iVar2 / iVar1;
      if (iVar1 == 0) {
        trap(0x1c00);
      }
      if ((iVar1 == -1) && (iVar2 == -0x80000000)) {
        trap(0x1800);
      }
      if (iVar4 == 0) {
        trap(0x1c00);
      }
      if ((iVar4 == -1) && (iVar3 == -0x80000000)) {
        trap(0x1800);
      }
      *(int *)(param_1 + -0x7ffd4edc) = iVar4;
      *(int *)(&DAT_8002b120 + param_1) = iVar3 / iVar4;
      *(int *)(&DAT_8002b11c + param_1) = iVar3 / iVar4 + param_2;
    }
  }
  return;
}



// FUNCTION 80021478 FUN_80021478 [[80021478, 80021693]]

void FUN_80021478(int param_1,undefined4 param_2,undefined4 param_3,int param_4,undefined4 param_5,
                 uint param_6,undefined1 param_7,undefined1 param_8,undefined1 param_9,
                 undefined1 param_10,undefined1 param_11,undefined1 param_12)

{
  int iVar1;
  int iVar2;
  short *psVar3;
  short *psVar4;
  int unaff_gp;
  short local_48 [8];
  short local_38 [8];
  
  iVar1 = FUN_8002104c(param_1,2);
  if ((iVar1 == 0) && (1 < param_6)) {
    param_1 = param_1 * 0x3c;
    psVar3 = (short *)(&DAT_8002b10c + param_1);
    if (param_6 == 0xffffffff) {
      *(undefined4 *)(&DAT_8002b11c + param_1) = 0xffffffff;
      *(undefined4 *)(&DAT_8002b120 + param_1) = 0xffffffff;
      *(undefined4 *)(&DAT_8002b118 + param_1) = 0xffffffff;
      *(undefined4 *)(&DAT_8002b114 + param_1) = 0xffffffff;
      *(undefined4 *)(&DAT_8002b110 + param_1) = 0xffffffff;
      psVar3[0] = -1;
      psVar3[1] = -1;
    }
    else {
      iVar1 = param_6 - 1;
      if (iVar1 == 0) {
        trap(0x1c00);
      }
      if ((iVar1 == -1) && (param_4 << 0x10 == -0x80000000)) {
        trap(0x1800);
      }
      *(undefined1 *)(param_1 + -0x7ffd4ec0) = param_7;
      *(undefined1 *)(param_1 + -0x7ffd4ebf) = param_8;
      *(undefined1 *)(param_1 + -0x7ffd4ebe) = param_9;
      *(undefined1 *)(param_1 + -0x7ffd4ebd) = param_10;
      *(undefined1 *)(param_1 + -0x7ffd4ebc) = param_11;
      *(undefined1 *)(param_1 + -0x7ffd4ebb) = param_12;
      iVar2 = *(int *)(unaff_gp + 0x10);
      *(undefined4 *)psVar3 = param_2;
      *(undefined4 *)(&DAT_8002b110 + param_1) = param_3;
      *(int *)(&DAT_8002b114 + param_1) = param_4;
      *(uint *)(&DAT_8002b11c + param_1) = param_6;
      *(undefined4 *)(&DAT_8002b120 + param_1) = 0;
      *(undefined4 *)(&DAT_8002b118 + param_1) = param_5;
      *(int *)(param_1 + -0x7ffd4edc) = (param_4 << 0x10) / iVar1;
      if (iVar2 != 0) {
        iVar1 = 0;
        psVar4 = local_48;
        do {
          *psVar4 = *psVar3 + -2;
          psVar4[1] = *(short *)(&DAT_8002b110 + param_1) + ((ushort)iVar1 & 1) * 0x100 + -2;
          psVar4[2] = *(short *)(&DAT_8002b114 + param_1) + 4;
          iVar1 = iVar1 + 1;
          psVar4[3] = *(short *)(&DAT_8002b118 + param_1) + 4;
          FUN_80022f3c(psVar4,*(undefined1 *)(param_1 + -0x7ffd4ebd),
                       *(undefined1 *)(param_1 + -0x7ffd4ebc),*(undefined1 *)(param_1 + -0x7ffd4ebb)
                      );
          psVar4 = psVar4 + 4;
        } while (iVar1 < 2);
        iVar1 = 2;
        psVar4 = local_38;
        do {
          *psVar4 = *psVar3;
          psVar4[1] = *(short *)(&DAT_8002b110 + param_1) + ((ushort)iVar1 & 1) * 0x100;
          psVar4[2] = *(short *)(&DAT_8002b114 + param_1);
          iVar1 = iVar1 + 1;
          psVar4[3] = *(short *)(&DAT_8002b118 + param_1);
          FUN_80022f3c(psVar4,0,0,0);
          psVar4 = psVar4 + 4;
        } while (iVar1 < 4);
      }
    }
  }
  return;
}



// FUNCTION 80021694 FUN_80021694 [[80021694, 80021717]]

void FUN_80021694(int param_1,undefined1 param_2,undefined1 param_3,undefined1 param_4)

{
  int iVar1;
  
  iVar1 = FUN_8002104c(param_1,3);
  if ((iVar1 == 0) && (param_1 = param_1 * 0x3c, *(int *)(&DAT_8002b11c + param_1) != -1)) {
    *(undefined1 *)(param_1 + -0x7ffd4ec0) = param_2;
    *(undefined1 *)(param_1 + -0x7ffd4ebf) = param_3;
    *(undefined1 *)(param_1 + -0x7ffd4ebe) = param_4;
  }
  return;
}



// FUNCTION 80021718 FUN_80021718 [[80021718, 8002175f]]

void FUN_80021718(void)

{
  undefined4 *puVar1;
  undefined4 *puVar2;
  int iVar3;
  
  puVar2 = (undefined4 *)&DAT_8002b10c;
  iVar3 = 0;
  puVar1 = (undefined4 *)&DAT_8002b11c;
  do {
    iVar3 = iVar3 + 1;
    *puVar2 = 0xffffffff;
    puVar1[-3] = 0xffffffff;
    puVar1[-2] = 0xffffffff;
    puVar1[-1] = 0xffffffff;
    puVar1[1] = 0xffffffff;
    *puVar1 = 0xffffffff;
    puVar1 = puVar1 + 0xf;
    puVar2 = puVar2 + 0xf;
  } while (iVar3 < 4);
  return;
}



// FUNCTION 80021768 FUN_80021768 [[80021768, 80021807]]

void FUN_80021768(undefined2 param_1,undefined2 param_2)

{
  undefined2 *puVar1;
  int iVar2;
  undefined2 local_40 [16];
  
  iVar2 = 0;
  puVar1 = local_40;
  do {
    *puVar1 = param_1;
    puVar1[1] = param_2;
    puVar1[2] = 2;
    puVar1[3] = 2;
    iVar2 = iVar2 + 1;
    FUN_80022f3c(puVar1,DAT_8002b1f7,DAT_8002b1f8,DAT_8002b1f9);
    puVar1 = puVar1 + 4;
  } while (iVar2 < 2);
  FUN_80022db8(0);
  return;
}



// FUNCTION 80021808 FUN_80021808 [[80021808, 800219c3]]

void FUN_80021808(int *param_1)

{
  int iVar1;
  int iVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  int iVar6;
  int iVar7;
  int iVar8;
  
  iVar2 = *param_1;
  iVar3 = param_1[1];
  if (param_1[8] < param_1[7]) {
    param_1[7] = 0;
    param_1[10] = 1;
    param_1[0xc] = 0;
    param_1[8] = param_1[2];
    param_1[0xb] = param_1[2] * 2 + -1;
    if (*(char *)((int)param_1 + 0x37) == -1) {
      *(undefined1 *)((int)param_1 + 0x37) = 0x40;
    }
    else {
      *(undefined1 *)((int)param_1 + 0x37) = 0xff;
    }
  }
  iVar4 = param_1[7];
  iVar5 = param_1[8];
  iVar7 = param_1[10];
  iVar8 = param_1[0xb];
  iVar6 = param_1[0xc];
  switch(param_1[5] & 7) {
  case 0:
    iVar1 = iVar4;
    goto LAB_80021974;
  case 1:
    iVar2 = iVar2 + iVar5;
    iVar3 = iVar3 - iVar4;
    break;
  case 2:
    iVar2 = iVar2 - iVar4;
    iVar3 = iVar3 - iVar5;
    break;
  case 3:
    FUN_80021768(iVar2 - iVar5,iVar3 + iVar4);
    if (param_1[5] == (param_1[5] / 3) * 3) {
      iVar4 = iVar4 + 1;
      iVar6 = iVar6 + iVar7;
      iVar7 = iVar7 + 2;
      if (iVar8 < iVar6 * 2) {
        iVar5 = iVar5 + -1;
        iVar6 = iVar6 - iVar8;
        iVar8 = iVar8 + -2;
      }
    }
    goto switchD_800218c4_default;
  case 4:
    iVar2 = iVar2 + iVar5;
    iVar3 = iVar3 + iVar4;
    break;
  case 5:
    iVar2 = iVar2 + iVar4;
    iVar3 = iVar3 - iVar5;
    break;
  case 6:
    iVar2 = iVar2 - iVar5;
    iVar3 = iVar3 - iVar4;
    break;
  case 7:
    iVar1 = -iVar4;
LAB_80021974:
    iVar2 = iVar2 + iVar1;
    iVar3 = iVar3 + iVar5;
    break;
  default:
    goto switchD_800218c4_default;
  }
  FUN_80021768(iVar2,iVar3);
switchD_800218c4_default:
  param_1[7] = iVar4;
  param_1[8] = iVar5;
  param_1[10] = iVar7;
  param_1[0xb] = iVar8;
  param_1[0xc] = iVar6;
  param_1[5] = param_1[5] + 1;
  return;
}



// FUNCTION 800219cc FUN_800219cc [[800219cc, 800219db]]

void FUN_800219cc(void)

{
  syscall(0);
  return;
}



// FUNCTION 800219dc FUN_800219dc [[800219dc, 80021a0b]]

void FUN_800219dc(void)

{
  (**(code **)(PTR_PTR_8002a834 + 0xc))();
  return;
}



// FUNCTION 80021a0c FUN_80021a0c [[80021a0c, 80021a3b]]

void FUN_80021a0c(void)

{
  (**(code **)(PTR_PTR_8002a834 + 8))();
  return;
}



// FUNCTION 80021a3c FUN_80021a3c [[80021a3c, 80021a6b]]

void FUN_80021a3c(void)

{
  (**(code **)(PTR_PTR_8002a834 + 4))();
  return;
}



// FUNCTION 80021a6c FUN_80021a6c [[80021a6c, 80021a9f]]

void FUN_80021a6c(undefined4 param_1)

{
  (**(code **)(PTR_PTR_8002a834 + 0x14))(4,param_1);
  return;
}



// FUNCTION 80021aa0 FUN_80021aa0 [[80021aa0, 80021acf]]

void FUN_80021aa0(void)

{
  (**(code **)(PTR_PTR_8002a834 + 0x14))();
  return;
}



// FUNCTION 80021ad0 FUN_80021ad0 [[80021ad0, 80021aff]]

void FUN_80021ad0(void)

{
  (**(code **)(PTR_PTR_8002a834 + 0x10))();
  return;
}



// FUNCTION 80021b00 FUN_80021b00 [[80021b00, 80021b2f]]

void FUN_80021b00(void)

{
  (**(code **)(PTR_PTR_8002a834 + 0x18))();
  return;
}



// FUNCTION 80021b30 FUN_80021b30 [[80021b30, 80021b3f]]

undefined2 FUN_80021b30(void)

{
  return DAT_800297ae;
}



// FUNCTION 80021b58 FUN_80021b58 [[80021b58, 80021b6f]]

undefined2 FUN_80021b58(undefined2 param_1)

{
  undefined2 uVar1;
  
  uVar1 = *DAT_8002a83c;
  *DAT_8002a83c = param_1;
  return uVar1;
}



// FUNCTION 80021b70 FUN_80021b70 [[80021b70, 80021c47]]

undefined2 * FUN_80021b70(void)

{
  undefined2 *puVar1;
  undefined2 *puVar2;
  undefined2 *puVar3;
  int iVar4;
  undefined4 uVar5;
  
  puVar2 = DAT_8002a83c;
  puVar1 = DAT_8002a838;
  puVar3 = (undefined2 *)0x0;
  if (DAT_800297ac == 0) {
    *DAT_8002a83c = 0;
    *puVar1 = *puVar2;
    *DAT_8002a840 = 0x33333333;
    FUN_80022078(&DAT_800297ac,0x41a);
    iVar4 = FUN_80026cdc(&DAT_800297e4);
    if (iVar4 != 0) {
      FUN_80021c48();
    }
    DAT_800297e8 = &DAT_8002a7c4;
    FUN_80026cec(&DAT_800297e4);
    DAT_800297ac = 1;
    uVar5 = FUN_80026cfc();
    *(undefined4 *)(PTR_PTR_8002a834 + 0x14) = uVar5;
    uVar5 = FUN_80026e1c();
    *(undefined4 *)(PTR_PTR_8002a834 + 4) = uVar5;
    FUN_800270c4();
    puVar3 = &DAT_800297ac;
    FUN_800267cc();
  }
  return puVar3;
}



// FUNCTION 80021c48 FUN_80021c48 [[80021c48, 80021e17]]

void FUN_80021c48(void)

{
  bool bVar1;
  uint uVar2;
  int iVar3;
  uint uVar4;
  undefined4 *puVar5;
  
  if (DAT_800297ac == 0) {
    FUN_800270dc(s_unexpected_interrupt__04x__8002007c,*DAT_8002a838);
    FUN_800270ec();
  }
  DAT_800297ae = 1;
  uVar2 = (uint)(*DAT_8002a83c & DAT_800297dc & *DAT_8002a838);
  if (uVar2 != 0) {
    do {
      puVar5 = &DAT_800297b0;
      for (uVar4 = 0; (uVar2 != 0 && ((int)uVar4 < 0xb)); uVar4 = uVar4 + 1) {
        if ((uVar2 & 1) != 0) {
          *DAT_8002a838 = ~(ushort)(1 << (uVar4 & 0x1f));
          if ((code *)*puVar5 != (code *)0x0) {
            (*(code *)*puVar5)();
          }
        }
        puVar5 = puVar5 + 1;
        uVar2 = uVar2 >> 1;
      }
      uVar2 = (uint)(*DAT_8002a83c & DAT_800297dc & *DAT_8002a838);
    } while (uVar2 != 0);
  }
  if ((*DAT_8002a838 & *DAT_8002a83c) == 0) {
    DAT_8002a844 = 0;
  }
  else {
    iVar3 = DAT_8002a844 + 1;
    bVar1 = 0x800 < DAT_8002a844;
    DAT_8002a844 = iVar3;
    if (bVar1) {
      FUN_800270dc(s_intr_timeout__04x__04x__80020098,*DAT_8002a838,*DAT_8002a83c);
      DAT_8002a844 = 0;
      *DAT_8002a838 = 0;
    }
  }
  DAT_800297ae = 0;
  FUN_800270ec();
  return;
}



// FUNCTION 80021e18 FUN_80021e18 [[80021e18, 80021f5f]]

int FUN_80021e18(uint param_1,int param_2)

{
  ushort uVar1;
  int *piVar2;
  ushort uVar3;
  int iVar4;
  
  piVar2 = &DAT_800297b0 + param_1;
  iVar4 = *piVar2;
  if ((param_2 != iVar4) && (DAT_800297ac != 0)) {
    uVar3 = *DAT_8002a83c;
    *DAT_8002a83c = 0;
    if (param_2 == 0) {
      uVar1 = ~(ushort)(1 << (param_1 & 0x1f));
      *piVar2 = 0;
      uVar3 = uVar3 & uVar1;
      DAT_800297dc = DAT_800297dc & uVar1;
    }
    else {
      *piVar2 = param_2;
      uVar1 = (ushort)(1 << (param_1 & 0x1f));
      uVar3 = uVar3 | uVar1;
      DAT_800297dc = DAT_800297dc | uVar1;
    }
    if (param_1 == 0) {
      FUN_800270fc(param_2 == 0);
      FUN_8002710c(3,param_2 == 0);
    }
    if (param_1 == 4) {
      FUN_8002710c(0,param_2 == 0);
    }
    if (param_1 == 5) {
      FUN_8002710c(1,param_2 == 0);
    }
    if (param_1 == 6) {
      FUN_8002710c(2,param_2 == 0);
    }
    *DAT_8002a83c = uVar3;
  }
  return iVar4;
}



// FUNCTION 80021f60 FUN_80021f60 [[80021f60, 80021fff]]

undefined2 * FUN_80021f60(void)

{
  undefined2 *puVar1;
  undefined2 *puVar2;
  
  puVar2 = (undefined2 *)0x0;
  if (DAT_800297ac != 0) {
    FUN_800219cc();
    puVar1 = DAT_8002a83c;
    puVar2 = DAT_8002a838;
    DAT_800297de = *DAT_8002a83c;
    DAT_800297e0 = *DAT_8002a840;
    *DAT_8002a83c = 0;
    *puVar2 = *puVar1;
    *DAT_8002a840 = *DAT_8002a840 & 0x77777777;
    FUN_8002711c();
    DAT_800297ac = 0;
    puVar2 = &DAT_800297ac;
  }
  return puVar2;
}



// FUNCTION 80022000 FUN_80022000 [[80022000, 80022077]]

undefined2 * FUN_80022000(void)

{
  undefined2 *puVar1;
  
  puVar1 = &DAT_800297ac;
  if (DAT_800297ac == 0) {
    FUN_80026cec(&DAT_800297e4);
    DAT_800297ac = 1;
    *DAT_8002a83c = DAT_800297de;
    *DAT_8002a840 = DAT_800297e0;
    FUN_800267cc();
  }
  else {
    puVar1 = (undefined2 *)0x0;
  }
  return puVar1;
}



// FUNCTION 80022078 FUN_80022078 [[80022078, 8002209b]]

void FUN_80022078(undefined4 *param_1,int param_2)

{
  int iVar1;
  
  iVar1 = param_2 + -1;
  if (param_2 != 0) {
    do {
      *param_1 = 0;
      iVar1 = iVar1 + -1;
      param_1 = param_1 + 1;
    } while (iVar1 != -1);
  }
  return;
}



// FUNCTION 8002209c FUN_8002209c [[8002209c, 800220cf]]

void FUN_8002209c(void)

{
  FUN_8002712c(DAT_8002a87c);
  DAT_8002a878 = 0;
  return;
}



// FUNCTION 800220d0 FUN_800220d0 [[800220d0, 80022343]]

void FUN_800220d0(char param_1,undefined4 param_2)

{
  int iVar1;
  undefined4 uVar2;
  undefined1 auStack_20 [16];
  
  DAT_8002a888 = param_2;
  if (param_1 == '\x01') {
    if (0 < DAT_8002a868) {
      if (DAT_8002a864 == 0x200) {
        if ((DAT_8002aa38 & 1) == 0) {
          FUN_800271bc(auStack_20,3);
        }
        else {
          FUN_8002714c(0);
          FUN_8002717c(auStack_20,3);
          FUN_8002719c(0);
          FUN_8002714c(FUN_80022344);
        }
        iVar1 = FUN_8002680c(auStack_20);
        if (iVar1 != DAT_8002a874) {
          FUN_800271e4(s_CdRead__sector_error_800200b8);
          DAT_8002a868 = -1;
        }
      }
      if ((DAT_8002aa38 & 1) == 0) {
        FUN_800271bc(DAT_8002a85c,DAT_8002a864);
        DAT_8002a85c = DAT_8002a85c + DAT_8002a864 * 4;
        DAT_8002a868 = DAT_8002a868 + -1;
        DAT_8002a874 = DAT_8002a874 + 1;
      }
      else {
        FUN_8002717c(DAT_8002a85c,DAT_8002a864);
      }
    }
  }
  else {
    DAT_8002a868 = -1;
  }
  DAT_8002a86c = FUN_80026a8c(0xffffffff);
  if (DAT_8002a868 < 0) {
    FUN_80022414(1);
  }
  iVar1 = FUN_80026a8c(0xffffffff);
  if (DAT_8002a870 + 0x4b0 < iVar1) {
    DAT_8002a868 = -1;
  }
  if ((DAT_8002a868 == 0) || (iVar1 = FUN_80026a8c(0xffffffff), DAT_8002a870 + 0x4b0 < iVar1)) {
    FUN_800271fc(DAT_8002a880);
    if ((DAT_8002aa38 & 1) != 0) {
      FUN_8002714c(DAT_8002a884);
    }
    FUN_8002712c(FUN_8002209c);
    FUN_80026538(9,0);
    DAT_8002a878 = 1;
    if (DAT_8002aa34 != (code *)0x0) {
      uVar2 = 5;
      if (DAT_8002a868 == 0) {
        uVar2 = 2;
      }
      (*DAT_8002aa34)(uVar2,param_2);
    }
  }
  return;
}



// FUNCTION 80022344 FUN_80022344 [[80022344, 80022413]]

void FUN_80022344(void)

{
  DAT_8002a85c = DAT_8002a85c + DAT_8002a864 * 4;
  DAT_8002a868 = DAT_8002a868 + -1;
  DAT_8002a874 = DAT_8002a874 + 1;
  if (DAT_8002a868 == 0) {
    FUN_800271fc(DAT_8002a880);
    if ((DAT_8002aa38 & 1) != 0) {
      FUN_8002714c(DAT_8002a884);
    }
    FUN_8002712c(FUN_8002209c);
    FUN_80026538(9,0);
    DAT_8002a878 = 1;
    if (DAT_8002aa34 != (code *)0x0) {
      (*DAT_8002aa34)(2,DAT_8002a888);
    }
  }
  return;
}



// FUNCTION 80022414 FUN_80022414 [[80022414, 800225fb]]

undefined4 FUN_80022414(int param_1)

{
  uint uVar1;
  undefined4 uVar2;
  int iVar3;
  uint uVar4;
  undefined1 local_18 [8];
  
  FUN_8002712c(0);
  FUN_800271fc(0);
  if ((DAT_8002aa38 & 1) != 0) {
    FUN_8002714c(0);
  }
  uVar1 = FUN_8002721c();
  if ((uVar1 & 0x10) != 0) {
    uVar1 = FUN_80026a8c(0xffffffff);
    if ((uVar1 & 0x3f) == 0) {
      FUN_800271e4(s_CdRead__Shell_open____800200d0);
    }
    FUN_80026538(1,0);
    DAT_8002a870 = FUN_80026a8c(0xffffffff);
    DAT_8002a868 = 0xffffffff;
    return 0xffffffff;
  }
  if (param_1 != 0) {
    FUN_800271e4(s_CdRead__retry____800200e8);
    FUN_800263fc(9,0,0);
    uVar2 = FUN_8002722c();
    iVar3 = FUN_800263fc(2,uVar2,0);
    if (iVar3 == 0) {
      DAT_8002a868 = 0xffffffff;
      return 0xffffffff;
    }
  }
  FUN_8002723c();
  local_18[0] = (undefined1)DAT_8002a860;
  uVar4 = DAT_8002a860 & 0xff;
  uVar1 = FUN_8002725c();
  if (((uVar4 != uVar1) || (param_1 != 0)) && (iVar3 = FUN_800263fc(0xe,local_18,0), iVar3 == 0)) {
    DAT_8002a868 = 0xffffffff;
    return 0xffffffff;
  }
  uVar2 = FUN_8002722c();
  DAT_8002a874 = FUN_8002680c(uVar2);
  FUN_800271fc(FUN_800220d0);
  if ((DAT_8002aa38 & 1) != 0) {
    FUN_8002714c(FUN_80022344);
  }
  DAT_8002a85c = DAT_8002a858;
  FUN_80026538(6,0);
  DAT_8002a868 = DAT_8002a854;
  DAT_8002a86c = FUN_80026a8c(0xffffffff);
  return DAT_8002a868;
}



// FUNCTION 800225fc FUN_800225fc [[800225fc, 8002279b]]

void FUN_800225fc(void)

{
  int iVar1;
  int iVar2;
  
  if ((DAT_8002aa38 & 1) != 0) {
    FUN_8002719c(0);
  }
  DAT_8002a868 = 0;
  iVar1 = 1;
  if (DAT_8002a878 != 0) {
    iVar1 = FUN_80026a8c(0xffffffff);
    do {
      if (DAT_8002a878 == 0) {
        iVar1 = 0;
        DAT_8002a878 = 0;
        goto LAB_800226d0;
      }
      iVar2 = FUN_80026a8c(0xffffffff);
    } while ((uint)(iVar2 - iVar1) < 0x79);
    FUN_8002712c(DAT_8002a87c);
    iVar1 = -1;
    DAT_8002a878 = 0;
  }
LAB_800226d0:
  if (iVar1 != 0) {
    FUN_800271fc(DAT_8002a880);
    if ((DAT_8002aa38 & 1) != 0) {
      FUN_8002714c(DAT_8002a884);
    }
    FUN_8002712c(FUN_8002209c);
    FUN_80026538(9,0);
    DAT_8002a878 = 1;
    iVar1 = FUN_80026a8c(0xffffffff);
    do {
      if (DAT_8002a878 == 0) {
        return;
      }
      iVar2 = FUN_80026a8c(0xffffffff);
    } while ((uint)(iVar2 - iVar1) < 0x79);
    FUN_8002712c(DAT_8002a87c);
    DAT_8002a878 = 0;
  }
  return;
}



// FUNCTION 8002279c FUN_8002279c [[8002279c, 80022937]]

bool FUN_8002279c(undefined4 param_1,undefined4 param_2,uint param_3)

{
  int iVar1;
  int iVar2;
  uint uVar3;
  
  if (DAT_8002a878 != 0) {
    iVar1 = FUN_80026a8c(0xffffffff);
    do {
      if (DAT_8002a878 == 0) goto LAB_80022818;
      iVar2 = FUN_80026a8c(0xffffffff);
    } while ((uint)(iVar2 - iVar1) < 0x79);
    FUN_8002712c(DAT_8002a87c);
    DAT_8002a878 = 0;
  }
LAB_80022818:
  if ((param_3 & 0x30) == 0) {
    DAT_8002a864 = 0x200;
  }
  else if ((param_3 & 0x30) == 0x20) {
    DAT_8002a864 = 0x249;
  }
  else {
    DAT_8002a864 = 0x246;
  }
  DAT_8002a860 = param_3 | 0x20;
  DAT_8002a854 = param_1;
  DAT_8002a858 = param_2;
  DAT_8002a87c = FUN_8002712c(0);
  DAT_8002a880 = FUN_800271fc(0);
  if ((DAT_8002aa38 & 1) != 0) {
    DAT_8002a884 = FUN_8002714c(0);
  }
  DAT_8002a870 = FUN_80026a8c(0xffffffff);
  uVar3 = FUN_8002721c();
  if ((uVar3 & 0xe0) != 0) {
    FUN_8002666c(9,0,0);
  }
  iVar1 = FUN_80022414(0);
  return 0 < iVar1;
}



// FUNCTION 80022938 FUN_80022938 [[80022938, 80022a3b]]

int FUN_80022938(int param_1,undefined4 param_2)

{
  int iVar1;
  int iVar2;
  
  do {
    iVar1 = FUN_80026a8c(0xffffffff);
    iVar2 = -1;
    if ((iVar1 <= DAT_8002a870 + 0x4b0) &&
       ((DAT_8002a868 < 0 ||
        (iVar1 = FUN_80026a8c(0xffffffff), iVar2 = DAT_8002a868, DAT_8002a86c + 0x3c < iVar1)))) {
      FUN_80022414(1);
      iVar2 = DAT_8002a854;
    }
  } while ((param_1 == 0) && (((DAT_8002a878 != 0 && (iVar2 == 0)) || (0 < iVar2))));
  FUN_8002726c(1,param_2);
  if ((DAT_8002a878 != 0) && (iVar2 == 0)) {
    iVar2 = 1;
  }
  return iVar2;
}



// FUNCTION 80022a3c FUN_80022a3c [[80022a3c, 80022baf]]

uint FUN_80022a3c(uint param_1)

{
  uint uVar1;
  
  uVar1 = param_1 & 7;
  if (uVar1 == 3) {
LAB_80022a88:
    FUN_800270dc(s_ResetGraph_jtb__08x_env__08x_80020140,
                 &PTR_s__Id__sys_c_v_1_140_1998_01_12_07_8002a89c,&DAT_8002a8e4);
LAB_80022aa4:
    FUN_80025914(&DAT_8002a8e4,0,0x80);
    FUN_800219dc();
    FUN_8002728c((uint)PTR_PTR_8002a8dc & 0xffffff);
    DAT_8002a8e4 = FUN_80025044(param_1);
    DAT_8002a8e5 = 1;
    DAT_8002a8e8 = *(undefined2 *)(&DAT_8002a964 + (uint)DAT_8002a8e4 * 4);
    DAT_8002a8ea = *(undefined2 *)(&DAT_8002a970 + (uint)DAT_8002a8e4 * 4);
    FUN_80025914(&DAT_8002a8f4,0xffffffff,0x5c);
    FUN_80025914(&DAT_8002a950,0xffffffff,0x14);
    uVar1 = (uint)DAT_8002a8e4;
  }
  else {
    if (uVar1 < 4) {
      if (uVar1 == 0) goto LAB_80022a88;
    }
    else if (uVar1 == 5) goto LAB_80022aa4;
    if (1 < DAT_8002a8e6) {
      (*(code *)PTR_FUN_8002a8e0)(s_ResetGraph__d_____80020160,param_1);
    }
    uVar1 = (**(code **)(PTR_PTR_8002a8dc + 0x34))(1);
  }
  return uVar1;
}



// FUNCTION 80022bb0 FUN_80022bb0 [[80022bb0, 80022c0b]]

undefined1 FUN_80022bb0(char param_1)

{
  undefined1 uVar1;
  
  uVar1 = DAT_8002a8e6;
  DAT_8002a8e6 = param_1;
  if (param_1 != '\0') {
    (*(code *)PTR_FUN_8002a8e0)
              (s_SetGraphDebug_level__d_type__d_r_80020174,param_1,DAT_8002a8e4,DAT_8002a8e7);
  }
  return uVar1;
}



// FUNCTION 80022c0c FUN_80022c0c [[80022c0c, 80022caf]]

byte FUN_80022c0c(uint param_1)

{
  byte bVar1;
  
  bVar1 = DAT_8002a8e5;
  if (1 < DAT_8002a8e6) {
    (*(code *)PTR_FUN_8002a8e0)(s_SetGrapQue__d_____800201a0,param_1);
  }
  if (param_1 != DAT_8002a8e5) {
    (**(code **)(PTR_PTR_8002a8dc + 0x34))(1);
    DAT_8002a8e5 = (byte)param_1;
    FUN_80021a3c(2,0);
  }
  return bVar1;
}



// FUNCTION 80022cc0 FUN_80022cc0 [[80022cc0, 80022d1f]]

undefined4 FUN_80022cc0(undefined4 param_1)

{
  undefined4 uVar1;
  
  if (1 < DAT_8002a8e6) {
    (*(code *)PTR_FUN_8002a8e0)(s_DrawSyncCallback__08x_____800201b4,param_1);
  }
  uVar1 = DAT_8002a8f0;
  DAT_8002a8f0 = param_1;
  return uVar1;
}



// FUNCTION 80022d20 FUN_80022d20 [[80022d20, 80022db7]]

void FUN_80022d20(int param_1)

{
  undefined4 uVar1;
  
  if (1 < DAT_8002a8e6) {
    (*(code *)PTR_FUN_8002a8e0)(s_SetDispMask__d_____800201d0,param_1);
  }
  if (param_1 == 0) {
    FUN_80025914(&DAT_8002a950,0xffffffff,0x14);
  }
  uVar1 = 0x3000001;
  if (param_1 != 0) {
    uVar1 = 0x3000000;
  }
  (**(code **)(PTR_PTR_8002a8dc + 0x10))(uVar1);
  return;
}



// FUNCTION 80022db8 FUN_80022db8 [[80022db8, 80022e1f]]

void FUN_80022db8(undefined4 param_1)

{
  if (1 < DAT_8002a8e6) {
    (*(code *)PTR_FUN_8002a8e0)(s_DrawSync__d_____800201e4,param_1);
  }
  (**(code **)(PTR_PTR_8002a8dc + 0x3c))(param_1);
  return;
}



// FUNCTION 80022e20 FUN_80022e20 [[80022e20, 80022f3b]]

void FUN_80022e20(undefined4 param_1,short *param_2)

{
  int iVar1;
  char *pcVar2;
  int iVar3;
  
  if (DAT_8002a8e6 == '\x01') {
    iVar3 = (int)param_2[2];
    if ((iVar3 <= DAT_8002a8e8) && (iVar3 + *param_2 <= (int)DAT_8002a8e8)) {
      iVar1 = (int)param_2[1];
      if (((iVar1 <= DAT_8002a8ea) &&
          (((iVar1 + param_2[3] <= (int)DAT_8002a8ea && (0 < iVar3)) && (-1 < *param_2)))) &&
         ((-1 < iVar1 && (0 < param_2[3])))) {
        return;
      }
    }
    pcVar2 = s__s_bad_RECT_800201f8;
  }
  else {
    if (DAT_8002a8e6 != '\x02') {
      return;
    }
    pcVar2 = &DAT_80020218;
  }
  (*(code *)PTR_FUN_8002a8e0)(pcVar2,param_1);
  (*(code *)PTR_FUN_8002a8e0)
            (s___d__d____d__d__80020204,(int)*param_2,(int)param_2[1],(int)param_2[2],
             (int)param_2[3]);
  return;
}



// FUNCTION 80022f3c FUN_80022f3c [[80022f3c, 80022fcb]]

void FUN_80022f3c(undefined4 param_1,uint param_2,uint param_3,uint param_4)

{
  FUN_80022e20(s_ClearImage_8002021c,param_1);
  (**(code **)(PTR_PTR_8002a8dc + 8))
            (*(undefined4 *)(PTR_PTR_8002a8dc + 0xc),param_1,8,
             (param_4 & 0xff) << 0x10 | (param_3 & 0xff) << 8 | param_2 & 0xff);
  return;
}



// FUNCTION 80022fcc FUN_80022fcc [[80022fcc, 80023063]]

void FUN_80022fcc(undefined4 param_1,uint param_2,uint param_3,uint param_4)

{
  FUN_80022e20(s_ClearImage2_80020228,param_1);
  (**(code **)(PTR_PTR_8002a8dc + 8))
            (*(undefined4 *)(PTR_PTR_8002a8dc + 0xc),param_1,8,
             (param_4 & 0xff) << 0x10 | (param_3 & 0xff) << 8 | 0x80000000 | param_2 & 0xff);
  return;
}



// FUNCTION 80023064 FUN_80023064 [[80023064, 800230c3]]

void FUN_80023064(undefined4 param_1,undefined4 param_2)

{
  FUN_80022e20(s_LoadImage_80020234,param_1);
  (**(code **)(PTR_PTR_8002a8dc + 8))(*(undefined4 *)(PTR_PTR_8002a8dc + 0x20),param_1,8,param_2);
  return;
}



// FUNCTION 800230c4 FUN_800230c4 [[800230c4, 80023123]]

void FUN_800230c4(undefined4 param_1,undefined4 param_2)

{
  FUN_80022e20(s_StoreImage_80020240,param_1);
  (**(code **)(PTR_PTR_8002a8dc + 8))(*(undefined4 *)(PTR_PTR_8002a8dc + 0x1c),param_1,8,param_2);
  return;
}



// FUNCTION 80023124 FUN_80023124 [[80023124, 800231db]]

undefined4 FUN_80023124(undefined4 *param_1,uint param_2,int param_3)

{
  undefined4 uVar1;
  
  FUN_80022e20(s_MoveImage_8002024c,param_1);
  uVar1 = 0xffffffff;
  if (*(short *)(param_1 + 1) != 0) {
    if (*(short *)((int)param_1 + 6) == 0) {
      uVar1 = 0xffffffff;
    }
    else {
      DAT_8002a988 = param_3 << 0x10 | param_2 & 0xffff;
      DAT_8002a984 = *param_1;
      DAT_8002a98c = param_1[1];
      uVar1 = (**(code **)(PTR_PTR_8002a8dc + 8))
                        (*(undefined4 *)(PTR_PTR_8002a8dc + 0x18),&DAT_8002a97c,0x14,0);
    }
  }
  return uVar1;
}



// FUNCTION 80023350 FUN_80023350 [[80023350, 800233ab]]

void FUN_80023350(int param_1)

{
  undefined1 uVar1;
  
  uVar1 = *(undefined1 *)(param_1 + 3);
  (**(code **)(PTR_PTR_8002a8dc + 0x3c))(0);
  (**(code **)(PTR_PTR_8002a8dc + 0x14))(param_1 + 4,uVar1);
  return;
}



// FUNCTION 8002341c FUN_8002341c [[8002341c, 800234db]]

int FUN_8002341c(int param_1)

{
  undefined *puVar1;
  
  if (1 < DAT_8002a8e6) {
    (*(code *)PTR_FUN_8002a8e0)(s_PutDrawEnv__08x_____8002029c,param_1);
  }
  FUN_80023dfc(param_1 + 0x1c,param_1);
  puVar1 = PTR_PTR_8002a8dc;
  *(uint *)(param_1 + 0x1c) = *(uint *)(param_1 + 0x1c) | 0xffffff;
  (**(code **)(puVar1 + 8))(*(undefined4 *)(puVar1 + 0x18),param_1 + 0x1c,0x40,0);
  FUN_8002729c(&DAT_8002a8f4,param_1,0x5c);
  return param_1;
}



// FUNCTION 800234dc FUN_800234dc [[800234dc, 800235b3]]

void FUN_800234dc(uint param_1,int param_2)

{
  undefined *puVar1;
  
  if (1 < DAT_8002a8e6) {
    (*(code *)PTR_FUN_8002a8e0)(s_DrawOTagEnv__08x__08x_____800202b4,param_1,param_2);
  }
  FUN_80023dfc(param_2 + 0x1c,param_2);
  puVar1 = PTR_PTR_8002a8dc;
  *(uint *)(param_2 + 0x1c) = *(uint *)(param_2 + 0x1c) & 0xff000000 | param_1 & 0xffffff;
  (**(code **)(puVar1 + 8))(*(undefined4 *)(puVar1 + 0x18),param_2 + 0x1c,0x40,0);
  FUN_8002729c(&DAT_8002a8f4,param_2,0x5c);
  return;
}



// FUNCTION 800235b4 FUN_800235b4 [[800235b4, 800235e7]]

undefined4 FUN_800235b4(undefined4 param_1)

{
  FUN_8002729c(param_1,&DAT_8002a8f4,0x5c);
  return param_1;
}



// FUNCTION 800235e8 FUN_800235e8 [[800235e8, 80023adf]]

ushort * FUN_800235e8(ushort *param_1)

{
  ushort uVar1;
  bool bVar2;
  char cVar3;
  int iVar4;
  int iVar5;
  uint uVar6;
  uint uVar7;
  uint uVar8;
  int iVar9;
  uint uVar10;
  uint uVar11;
  
  uVar10 = 0x8000000;
  if (1 < DAT_8002a8e6) {
    (*(code *)PTR_FUN_8002a8e0)(s_PutDispEnv__08x_____800202d0,param_1);
  }
  (**(code **)(PTR_PTR_8002a8dc + 0x10))((param_1[1] & 0x3ff) << 10 | *param_1 & 0x3ff | 0x5000000);
  if ((((DAT_8002a960 != *(int *)(param_1 + 8)) || (DAT_8002a950 != *param_1)) ||
      (DAT_8002a952 != param_1[1])) ||
     ((DAT_8002a954 != param_1[2] || (DAT_8002a956 != param_1[3])))) {
    cVar3 = FUN_800267f0();
    *(char *)(param_1 + 9) = cVar3;
    if (cVar3 == '\x01') {
      uVar10 = 0x8000008;
    }
    if (*(char *)((int)param_1 + 0x11) != '\0') {
      uVar10 = uVar10 | 0x10;
    }
    if ((char)param_1[8] != '\0') {
      uVar10 = uVar10 | 0x20;
    }
    if (DAT_8002a8e7 != '\0') {
      uVar10 = uVar10 | 0x80;
    }
    uVar1 = param_1[2];
    if (0x118 < (short)uVar1) {
      if ((short)uVar1 < 0x161) {
        uVar10 = uVar10 | 1;
      }
      else if ((short)uVar1 < 0x191) {
        uVar10 = uVar10 | 0x40;
      }
      else if ((short)uVar1 < 0x231) {
        uVar10 = uVar10 | 2;
      }
      else {
        uVar10 = uVar10 | 3;
      }
    }
    bVar2 = (short)param_1[3] < 0x121;
    if ((char)param_1[9] == '\0') {
      bVar2 = (short)param_1[3] < 0x101;
    }
    if (!bVar2) {
      uVar10 = uVar10 | 0x24;
    }
    (**(code **)(PTR_PTR_8002a8dc + 0x10))(uVar10);
    *(undefined1 *)(param_1 + 9) = 8;
  }
  if (((DAT_8002a958 == param_1[4]) && (DAT_8002a95a == param_1[5])) &&
     ((DAT_8002a95c == param_1[6] && ((DAT_8002a95e == param_1[7] && ((char)param_1[9] != '\b'))))))
  goto LAB_80023ab0;
  cVar3 = FUN_800267f0();
  *(char *)(param_1 + 9) = cVar3;
  uVar10 = (int)(short)param_1[5] + 0x13;
  if (cVar3 == '\0') {
    uVar10 = (int)(short)param_1[5] + 0x10;
  }
  uVar11 = uVar10 + (int)(short)param_1[7];
  if ((short)param_1[7] == 0) {
    uVar11 = uVar10 + 0xf0;
  }
  uVar1 = param_1[2];
  iVar9 = 0;
  if ((((0x118 < (short)uVar1) && (iVar9 = 1, 0x160 < (short)uVar1)) &&
      (iVar9 = 2, 400 < (short)uVar1)) && (iVar9 = 4, (short)uVar1 < 0x231)) {
    iVar9 = 3;
  }
  iVar4 = ((uint)(byte)param_1[9] * 5 + iVar9) * 4;
  iVar5 = (uint)*(ushort *)(&DAT_8002a9ba + iVar4) - (uint)*(ushort *)(&DAT_8002a9b8 + iVar4);
  uVar7 = (uint)*(ushort *)(&DAT_8002a9b8 + iVar4) +
          (int)(short)param_1[4] * (uint)(byte)(&DAT_8002a9e0)[iVar9];
  if ((short)param_1[6] != 0) {
    iVar5 = iVar5 * (short)param_1[6] >> 8;
  }
  uVar6 = uVar7 + iVar5;
  if ((char)param_1[9] == '\0') {
    uVar8 = 500;
    if ((499 < (int)uVar7) && (uVar8 = 0xcb2, (int)uVar7 < 0xcb3)) {
      uVar8 = uVar7;
    }
    uVar7 = uVar8 + (uint)(byte)(&DAT_8002a9e0)[iVar9] * 4;
    if (((int)uVar7 <= (int)uVar6) && (uVar7 = 0xcda, (int)uVar6 < 0xcdb)) {
      uVar7 = uVar6;
    }
    if ((int)uVar10 < 0x10) {
      uVar6 = 0x10;
    }
    else {
      uVar6 = 0x101;
      if ((int)uVar10 < 0x102) {
        uVar6 = uVar10;
      }
    }
    uVar10 = uVar6 + 2;
    bVar2 = (int)uVar11 < 0x103;
    if ((int)uVar10 <= (int)uVar11) {
      uVar10 = 0x102;
      goto LAB_80023a48;
    }
  }
  else {
    uVar8 = 0x21c;
    if ((0x21b < (int)uVar7) && (uVar8 = 0xc94, (int)uVar7 < 0xc95)) {
      uVar8 = uVar7;
    }
    uVar7 = uVar8 + (uint)(byte)(&DAT_8002a9e0)[iVar9] * 4;
    if (((int)uVar7 <= (int)uVar6) && (uVar7 = 0xcbc, (int)uVar6 < 0xcbd)) {
      uVar7 = uVar6;
    }
    if ((int)uVar10 < 0x13) {
      uVar6 = 0x13;
    }
    else {
      uVar6 = 0x12f;
      if ((int)uVar10 < 0x130) {
        uVar6 = uVar10;
      }
    }
    bVar2 = (int)uVar11 < 0x132;
    uVar10 = uVar6 + 2;
    if ((int)(uVar6 + 2) <= (int)uVar11) {
      uVar10 = 0x131;
LAB_80023a48:
      if (bVar2) {
        uVar10 = uVar11;
      }
    }
  }
  (**(code **)(PTR_PTR_8002a8dc + 0x10))((uVar7 & 0xfff) << 0xc | uVar8 & 0xfff | 0x6000000);
  (**(code **)(PTR_PTR_8002a8dc + 0x10))((uVar10 & 0x3ff) << 10 | uVar6 & 0x3ff | 0x7000000);
LAB_80023ab0:
  FUN_8002729c(&DAT_8002a950,param_1,0x14);
  return param_1;
}



// FUNCTION 80023ae0 FUN_80023ae0 [[80023ae0, 80023b13]]

undefined4 FUN_80023ae0(undefined4 param_1)

{
  FUN_8002729c(param_1,&DAT_8002a950,0x14);
  return param_1;
}



// FUNCTION 80023b14 FUN_80023b14 [[80023b14, 80023b43]]

uint FUN_80023b14(void)

{
  uint uVar1;
  
  uVar1 = (**(code **)(PTR_PTR_8002a8dc + 0x38))();
  return uVar1 >> 0x1f;
}



// FUNCTION 80023b44 FUN_80023b44 [[80023b44, 80023bc3]]

void FUN_80023b44(int param_1,ushort *param_2)

{
  undefined4 uVar1;
  
  *(undefined1 *)(param_1 + 3) = 2;
  uVar1 = FUN_8002408c((int)(short)*param_2,(int)(short)param_2[1]);
  *(undefined4 *)(param_1 + 4) = uVar1;
  uVar1 = FUN_80024124((int)(((uint)*param_2 + (uint)param_2[2] + -1) * 0x10000) >> 0x10,
                       (int)(((uint)param_2[1] + (uint)param_2[3] + -1) * 0x10000) >> 0x10);
  *(undefined4 *)(param_1 + 8) = uVar1;
  return;
}



// FUNCTION 80023bc4 FUN_80023bc4 [[80023bc4, 80023c03]]

void FUN_80023bc4(int param_1,short *param_2)

{
  undefined4 uVar1;
  
  *(undefined1 *)(param_1 + 3) = 2;
  uVar1 = FUN_800241bc((int)*param_2,(int)param_2[1]);
  *(undefined4 *)(param_1 + 4) = uVar1;
  *(undefined4 *)(param_1 + 8) = 0;
  return;
}



// FUNCTION 80023c04 FUN_80023c04 [[80023c04, 80023dfb]]

void FUN_80023c04(int param_1,ushort *param_2)

{
  ushort uVar1;
  ushort uVar2;
  ushort uVar3;
  undefined4 uVar4;
  char cVar5;
  undefined4 local_18;
  undefined4 local_14;
  
  uVar4 = FUN_8002408c((int)(short)*param_2,(int)(short)param_2[1]);
  *(undefined4 *)(param_1 + 4) = uVar4;
  uVar4 = FUN_80024124((int)(((uint)param_2[2] + (uint)*param_2 + -1) * 0x10000) >> 0x10,
                       (int)(((uint)param_2[1] + (uint)param_2[3] + -1) * 0x10000) >> 0x10);
  *(undefined4 *)(param_1 + 8) = uVar4;
  uVar4 = FUN_800241bc((int)(short)param_2[4],(int)(short)param_2[5]);
  *(undefined4 *)(param_1 + 0xc) = uVar4;
  uVar4 = FUN_8002406c(*(undefined1 *)((int)param_2 + 0x17),(char)param_2[0xb],param_2[10]);
  *(undefined4 *)(param_1 + 0x10) = uVar4;
  uVar4 = FUN_800241d8(param_2 + 6);
  *(undefined4 *)(param_1 + 0x14) = uVar4;
  *(undefined4 *)(param_1 + 0x18) = 0xe6000000;
  cVar5 = '\a';
  if ((char)param_2[0xc] != '\0') {
    uVar3 = param_2[2];
    uVar1 = param_2[3];
    uVar2 = 0;
    if ((-1 < (short)uVar3) && (uVar2 = DAT_8002a8e8 - 1, (int)(short)uVar3 <= DAT_8002a8e8 + -1)) {
      uVar2 = uVar3;
    }
    if ((short)uVar1 < 0) {
      uVar3 = 0;
    }
    else {
      uVar3 = DAT_8002a8ea - 1;
      if ((int)(short)uVar1 <= DAT_8002a8ea + -1) {
        uVar3 = uVar1;
      }
    }
    cVar5 = '\n';
    local_14 = CONCAT22(uVar3,uVar2);
    local_18 = CONCAT22(param_2[1] - param_2[5],*param_2 - param_2[4]);
    *(uint *)(param_1 + 0x1c) =
         (uint)*(byte *)((int)param_2 + 0x1b) << 0x10 | (uint)(byte)param_2[0xd] << 8 | 0x60000000 |
         (uint)*(byte *)((int)param_2 + 0x19);
    *(undefined4 *)(param_1 + 0x20) = local_18;
    *(undefined4 *)(param_1 + 0x24) = local_14;
  }
  *(char *)(param_1 + 3) = cVar5 + -1;
  return;
}



// FUNCTION 80023dfc FUN_80023dfc [[80023dfc, 8002406b]]

void FUN_80023dfc(int param_1,ushort *param_2)

{
  ushort uVar1;
  ushort uVar2;
  ushort uVar3;
  undefined4 uVar4;
  char cVar5;
  undefined4 local_18;
  undefined4 local_14;
  
  uVar4 = FUN_8002408c((int)(short)*param_2,(int)(short)param_2[1]);
  *(undefined4 *)(param_1 + 4) = uVar4;
  uVar4 = FUN_80024124((int)(((uint)param_2[2] + (uint)*param_2 + -1) * 0x10000) >> 0x10,
                       (int)(((uint)param_2[1] + (uint)param_2[3] + -1) * 0x10000) >> 0x10);
  *(undefined4 *)(param_1 + 8) = uVar4;
  uVar4 = FUN_800241bc((int)(short)param_2[4],(int)(short)param_2[5]);
  *(undefined4 *)(param_1 + 0xc) = uVar4;
  uVar4 = FUN_8002406c(*(undefined1 *)((int)param_2 + 0x17),(char)param_2[0xb],param_2[10]);
  *(undefined4 *)(param_1 + 0x10) = uVar4;
  uVar4 = FUN_800241d8(param_2 + 6);
  *(undefined4 *)(param_1 + 0x14) = uVar4;
  *(undefined4 *)(param_1 + 0x18) = 0xe6000000;
  cVar5 = '\a';
  if ((char)param_2[0xc] != '\0') {
    uVar4 = *(undefined4 *)param_2;
    uVar3 = param_2[2];
    uVar1 = param_2[3];
    uVar2 = 0;
    if ((-1 < (short)uVar3) && (uVar2 = DAT_8002a8e8 - 1, (int)(short)uVar3 <= DAT_8002a8e8 + -1)) {
      uVar2 = uVar3;
    }
    if ((short)uVar1 < 0) {
      uVar3 = 0;
    }
    else {
      uVar3 = DAT_8002a8ea - 1;
      if ((int)(short)uVar1 <= DAT_8002a8ea + -1) {
        uVar3 = uVar1;
      }
    }
    local_14 = CONCAT22(uVar3,uVar2);
    if (((*param_2 & 0x3f) == 0) && ((uVar2 & 0x3f) == 0)) {
      cVar5 = '\n';
      *(uint *)(param_1 + 0x1c) =
           (uint)*(byte *)((int)param_2 + 0x1b) << 0x10 | (uint)(byte)param_2[0xd] << 8 | 0x2000000
           | (uint)*(byte *)((int)param_2 + 0x19);
      *(undefined4 *)(param_1 + 0x20) = uVar4;
      *(undefined4 *)(param_1 + 0x24) = local_14;
    }
    else {
      cVar5 = '\n';
      local_18 = CONCAT22(param_2[1] - param_2[5],*param_2 - param_2[4]);
      *(uint *)(param_1 + 0x1c) =
           (uint)*(byte *)((int)param_2 + 0x1b) << 0x10 | (uint)(byte)param_2[0xd] << 8 | 0x60000000
           | (uint)*(byte *)((int)param_2 + 0x19);
      *(undefined4 *)(param_1 + 0x20) = local_18;
      *(undefined4 *)(param_1 + 0x24) = local_14;
    }
  }
  *(char *)(param_1 + 3) = cVar5 + -1;
  return;
}



// FUNCTION 8002406c FUN_8002406c [[8002406c, 8002408b]]

uint FUN_8002406c(int param_1,int param_2,uint param_3)

{
  uint uVar1;
  
  uVar1 = 0xe1000000;
  if (param_2 != 0) {
    uVar1 = 0xe1000200;
  }
  param_3 = param_3 & 0x9ff;
  if (param_1 != 0) {
    param_3 = param_3 | 0x400;
  }
  return uVar1 | param_3;
}



// FUNCTION 8002408c FUN_8002408c [[8002408c, 80024123]]

uint FUN_8002408c(uint param_1,uint param_2)

{
  uint uVar1;
  
  uVar1 = 0;
  if ((-1 < (short)param_1) &&
     (uVar1 = DAT_8002a8e8 - 1, (int)(short)param_1 <= (short)DAT_8002a8e8 + -1)) {
    uVar1 = param_1;
  }
  if ((short)param_2 < 0) {
    param_2 = 0;
  }
  else if ((short)DAT_8002a8ea + -1 < (int)(short)param_2) {
    param_2 = DAT_8002a8ea - 1;
  }
  return (param_2 & 0x3ff) << 10 | uVar1 & 0x3ff | 0xe3000000;
}



// FUNCTION 80024124 FUN_80024124 [[80024124, 800241bb]]

uint FUN_80024124(uint param_1,uint param_2)

{
  uint uVar1;
  
  uVar1 = 0;
  if ((-1 < (short)param_1) &&
     (uVar1 = DAT_8002a8e8 - 1, (int)(short)param_1 <= (short)DAT_8002a8e8 + -1)) {
    uVar1 = param_1;
  }
  if ((short)param_2 < 0) {
    param_2 = 0;
  }
  else if ((short)DAT_8002a8ea + -1 < (int)(short)param_2) {
    param_2 = DAT_8002a8ea - 1;
  }
  return (param_2 & 0x3ff) << 10 | uVar1 & 0x3ff | 0xe4000000;
}



// FUNCTION 800241bc FUN_800241bc [[800241bc, 800241d7]]

uint FUN_800241bc(uint param_1,uint param_2)

{
  return (param_2 & 0x7ff) << 0xb | param_1 & 0x7ff | 0xe5000000;
}



// FUNCTION 800241d8 FUN_800241d8 [[800241d8, 80024257]]

uint FUN_800241d8(byte *param_1)

{
  uint uVar1;
  
  if (param_1 == (byte *)0x0) {
    uVar1 = 0;
  }
  else {
    uVar1 = (uint)(param_1[2] >> 3) << 0xf | (uint)(*param_1 >> 3) << 10 | 0xe2000000 |
            ((int)(-(int)*(short *)(param_1 + 6) & 0xffU) >> 3) << 5 |
            (int)(-(int)*(short *)(param_1 + 4) & 0xffU) >> 3;
  }
  return uVar1;
}



// FUNCTION 80024258 FUN_80024258 [[80024258, 8002426f]]

undefined4 FUN_80024258(void)

{
  return *DAT_8002a9ec;
}



// FUNCTION 80024270 FUN_80024270 [[80024270, 8002434f]]

int FUN_80024270(int param_1,int param_2)

{
  uint uVar1;
  int iVar2;
  
  *DAT_8002aa08 = *DAT_8002aa08 | 0x8000000;
  *DAT_8002aa04 = 0;
  *DAT_8002a9fc = param_1 + param_2 * 4 + -4;
  *DAT_8002aa00 = param_2;
  *DAT_8002aa04 = 0x11000002;
  FUN_800252bc();
  uVar1 = *DAT_8002aa04;
  while( true ) {
    if ((uVar1 & 0x1000000) == 0) {
      return param_2;
    }
    iVar2 = FUN_800252f0();
    if (iVar2 != 0) break;
    uVar1 = *DAT_8002aa04;
  }
  return -1;
}



// FUNCTION 80024350 FUN_80024350 [[80024350, 8002457f]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined4 FUN_80024350(ushort *param_1,uint param_2)

{
  ushort uVar1;
  
  if ((short)param_1[2] < 0) {
    uVar1 = 0;
  }
  else {
    uVar1 = DAT_8002a8e8 - 1;
    if ((int)(short)param_1[2] <= DAT_8002a8e8 + -1) {
      uVar1 = param_1[2];
    }
  }
  param_1[2] = uVar1;
  if ((short)param_1[3] < 0) {
    uVar1 = 0;
  }
  else {
    uVar1 = DAT_8002a8ea - 1;
    if ((int)(short)param_1[3] <= DAT_8002a8ea + -1) {
      uVar1 = param_1[3];
    }
  }
  param_1[3] = uVar1;
  if (((*param_1 & 0x3f) == 0) && ((param_1[2] & 0x3f) == 0)) {
    _DAT_8002b1fc = 0x5ffffff;
    _DAT_8002b200 = 0xe6000000;
    _DAT_8002b208 = param_2 & 0xffffff | 0x2000000;
    _DAT_8002b204 = *DAT_8002a9ec & 0x7ff | (param_2 >> 0x1f) << 10 | 0xe1000000;
    _DAT_8002b20c = *(undefined4 *)param_1;
    _DAT_8002b210 = *(uint *)(param_1 + 2);
  }
  else {
    _DAT_8002b1fc = 0x802b224;
    _DAT_8002b214 = param_2 & 0xffffff | 0x60000000;
    _DAT_8002b20c = 0xe6000000;
    _DAT_8002b200 = 0xe3000000;
    _DAT_8002b204 = 0xe4ffffff;
    _DAT_8002b208 = 0xe5000000;
    _DAT_8002b210 = *DAT_8002a9ec & 0x7ff | (param_2 >> 0x1f) << 10 | 0xe1000000;
    _DAT_8002b218 = *(undefined4 *)param_1;
    _DAT_8002b21c = *(undefined4 *)(param_1 + 2);
    _DAT_8002b224 = 0x3ffffff;
    _DAT_8002b228 = FUN_80024ae0(3);
    _DAT_8002b228 = _DAT_8002b228 | 0xe3000000;
    _DAT_8002b22c = FUN_80024ae0(4);
    _DAT_8002b22c = _DAT_8002b22c | 0xe4000000;
    _DAT_8002b230 = FUN_80024ae0(5);
    _DAT_8002b230 = _DAT_8002b230 | 0xe5000000;
  }
  FUN_80024a98(&DAT_8002b1fc);
  return 0;
}



// FUNCTION 80024580 FUN_80024580 [[80024580, 800247bb]]

/* WARNING: Removing unreachable block (ram,0x800246ec) */

undefined4 FUN_80024580(undefined4 *param_1,undefined4 *param_2)

{
  undefined4 uVar1;
  uint uVar2;
  int iVar3;
  int iVar4;
  short sVar5;
  short sVar6;
  int iVar7;
  
  FUN_800252bc();
  if (*(short *)(param_1 + 1) < 0) {
    sVar5 = 0;
  }
  else {
    sVar5 = *(short *)(param_1 + 1);
    if (DAT_8002a8e8 < *(short *)(param_1 + 1)) {
      sVar5 = DAT_8002a8e8;
    }
  }
  sVar6 = *(short *)((int)param_1 + 6);
  *(short *)(param_1 + 1) = sVar5;
  if (*(short *)((int)param_1 + 6) < 0) {
    sVar5 = 0;
  }
  else {
    sVar5 = DAT_8002a8ea;
    if (*(short *)((int)param_1 + 6) <= DAT_8002a8ea) goto LAB_80024628;
  }
  sVar6 = sVar5;
LAB_80024628:
  *(short *)((int)param_1 + 6) = sVar6;
  iVar4 = (int)*(short *)(param_1 + 1) * (int)sVar6 + 1;
  iVar7 = iVar4 - (iVar4 >> 0x1f) >> 5;
  if (iVar4 / 2 < 1) {
    uVar1 = 0xffffffff;
  }
  else {
    iVar4 = iVar4 / 2 + iVar7 * -0x10;
    uVar2 = *DAT_8002a9ec;
    while ((uVar2 & 0x4000000) == 0) {
      iVar3 = FUN_800252f0();
      if (iVar3 != 0) {
        return 0xffffffff;
      }
      uVar2 = *DAT_8002a9ec;
    }
    *DAT_8002a9ec = 0x4000000;
    *DAT_8002a9e8 = 0x1000000;
    *DAT_8002a9e8 = 0xa0000000;
    *DAT_8002a9e8 = *param_1;
    *DAT_8002a9e8 = param_1[1];
    while (iVar4 = iVar4 + -1, iVar4 != -1) {
      uVar1 = *param_2;
      param_2 = param_2 + 1;
      *DAT_8002a9e8 = uVar1;
    }
    if (iVar7 != 0) {
      *DAT_8002a9ec = 0x4000002;
      *DAT_8002a9f0 = (int)param_2;
      *DAT_8002a9f4 = iVar7 << 0x10 | 0x10;
      *DAT_8002a9f8 = 0x1000201;
    }
    uVar1 = 0;
  }
  return uVar1;
}



// FUNCTION 800247bc FUN_800247bc [[800247bc, 80024a3b]]

undefined4 FUN_800247bc(undefined4 *param_1,undefined4 *param_2)

{
  undefined4 uVar1;
  uint uVar2;
  int iVar3;
  int iVar4;
  short sVar5;
  short sVar6;
  int iVar7;
  
  FUN_800252bc();
  if (*(short *)(param_1 + 1) < 0) {
    sVar5 = 0;
  }
  else {
    sVar5 = *(short *)(param_1 + 1);
    if (DAT_8002a8e8 < *(short *)(param_1 + 1)) {
      sVar5 = DAT_8002a8e8;
    }
  }
  sVar6 = *(short *)((int)param_1 + 6);
  *(short *)(param_1 + 1) = sVar5;
  if (*(short *)((int)param_1 + 6) < 0) {
    sVar5 = 0;
  }
  else {
    sVar5 = DAT_8002a8ea;
    if (*(short *)((int)param_1 + 6) <= DAT_8002a8ea) goto LAB_8002485c;
  }
  sVar6 = sVar5;
LAB_8002485c:
  *(short *)((int)param_1 + 6) = sVar6;
  iVar4 = (int)*(short *)(param_1 + 1) * (int)sVar6 + 1;
  iVar7 = iVar4 - (iVar4 >> 0x1f) >> 5;
  if (iVar4 / 2 < 1) {
    uVar1 = 0xffffffff;
  }
  else {
    iVar4 = iVar4 / 2 + iVar7 * -0x10;
    uVar2 = *DAT_8002a9ec;
    while ((uVar2 & 0x4000000) == 0) {
      iVar3 = FUN_800252f0();
      if (iVar3 != 0) {
        return 0xffffffff;
      }
      uVar2 = *DAT_8002a9ec;
    }
    *DAT_8002a9ec = 0x4000000;
    *DAT_8002a9e8 = 0x1000000;
    *DAT_8002a9e8 = 0xc0000000;
    *DAT_8002a9e8 = *param_1;
    *DAT_8002a9e8 = param_1[1];
    uVar2 = *DAT_8002a9ec;
    while ((uVar2 & 0x8000000) == 0) {
      iVar3 = FUN_800252f0();
      if (iVar3 != 0) {
        return 0xffffffff;
      }
      uVar2 = *DAT_8002a9ec;
    }
    while (iVar4 = iVar4 + -1, iVar4 != -1) {
      *param_2 = *DAT_8002a9e8;
      param_2 = param_2 + 1;
    }
    if (iVar7 != 0) {
      *DAT_8002a9ec = 0x4000003;
      *DAT_8002a9f0 = (int)param_2;
      *DAT_8002a9f4 = iVar7 << 0x10 | 0x10;
      *DAT_8002a9f8 = 0x1000200;
    }
    uVar1 = 0;
  }
  return uVar1;
}



// FUNCTION 80024a3c FUN_80024a3c [[80024a3c, 80024a4f]]

void FUN_80024a3c(undefined4 param_1)

{
  *DAT_8002a9ec = param_1;
  return;
}



// FUNCTION 80024a58 FUN_80024a58 [[80024a58, 80024a97]]

undefined4 FUN_80024a58(undefined4 *param_1,int param_2)

{
  undefined4 uVar1;
  int iVar2;
  
  iVar2 = param_2 + -1;
  *DAT_8002a9ec = 0x4000000;
  if (param_2 != 0) {
    do {
      uVar1 = *param_1;
      param_1 = param_1 + 1;
      iVar2 = iVar2 + -1;
      *DAT_8002a9e8 = uVar1;
    } while (iVar2 != -1);
  }
  return 0;
}



// FUNCTION 80024a98 FUN_80024a98 [[80024a98, 80024adf]]

void FUN_80024a98(undefined4 param_1)

{
  *DAT_8002a9ec = 0x4000002;
  *DAT_8002a9f0 = param_1;
  *DAT_8002a9f4 = 0;
  *DAT_8002a9f8 = 0x1000401;
  return;
}



// FUNCTION 80024ae0 FUN_80024ae0 [[80024ae0, 80024b0f]]

uint FUN_80024ae0(uint param_1)

{
  *DAT_8002a9ec = param_1 | 0x10000000;
  return *DAT_8002a9e8 & 0xffffff;
}



// FUNCTION 80024b10 FUN_80024b10 [[80024b10, 80024b33]]

void FUN_80024b10(undefined4 param_1,undefined4 param_2,undefined4 param_3)

{
  FUN_80024b34(param_1,param_2,0,param_3);
  return;
}



// FUNCTION 80024b34 FUN_80024b34 [[80024b34, 80024de3]]

uint FUN_80024b34(code *param_1,undefined4 *param_2,int param_3,undefined4 param_4)

{
  uint uVar1;
  int iVar2;
  int iVar3;
  undefined4 uVar4;
  int iVar5;
  
  FUN_800252bc();
  while( true ) {
    if ((DAT_8002aa0c + 1 & 0x3f) != DAT_8002aa10) {
      DAT_8002aa14 = FUN_80021b58(0);
      DAT_8002a8ec = 1;
      if ((DAT_8002a8e5 == '\0') ||
         (((DAT_8002aa0c == DAT_8002aa10 && ((*DAT_8002a9f8 & 0x1000000) == 0)) &&
          (DAT_8002a8f0 == 0)))) {
        do {
        } while ((*DAT_8002a9ec & 0x4000000) == 0);
        (*param_1)(param_2,param_4);
        FUN_80021b58(DAT_8002aa14);
        uVar1 = 0;
      }
      else {
        FUN_80021a3c(2,FUN_80024de4);
        iVar5 = 0;
        if (param_3 == 0) {
          *(undefined4 **)(DAT_8002aa0c * 0x60 + -0x7ffd4db0) = param_2;
        }
        else {
          while( true ) {
            iVar2 = param_3;
            if (param_3 < 0) {
              iVar2 = param_3 + 3;
            }
            iVar3 = iVar5 * 4;
            if (iVar2 >> 2 <= iVar5) break;
            uVar4 = *param_2;
            param_2 = param_2 + 1;
            iVar5 = iVar5 + 1;
            *(undefined4 *)(iVar3 + DAT_8002aa0c * 0x60 + -0x7ffd4da8) = uVar4;
          }
          *(uint *)(DAT_8002aa0c * 0x60 + -0x7ffd4db0) = DAT_8002aa0c * 0x60 + -0x7ffd4da8;
        }
        *(undefined4 *)(DAT_8002aa0c * 0x60 + -0x7ffd4dac) = param_4;
        *(code **)(DAT_8002aa0c * 0x60 + -0x7ffd4db4) = param_1;
        DAT_8002aa0c = DAT_8002aa0c + 1 & 0x3f;
        FUN_80021b58(DAT_8002aa14);
        FUN_80024de4();
        uVar1 = DAT_8002aa0c - DAT_8002aa10 & 0x3f;
      }
      return uVar1;
    }
    iVar5 = FUN_800252f0();
    if (iVar5 != 0) break;
    FUN_80024de4();
  }
  return 0xffffffff;
}



// FUNCTION 80024de4 FUN_80024de4 [[80024de4, 80025043]]

uint FUN_80024de4(void)

{
  uint uVar1;
  
  uVar1 = 1;
  if ((*DAT_8002a9f8 & 0x1000000) == 0) {
    DAT_8002aa18 = FUN_80021b58(0);
    if (DAT_8002aa0c != DAT_8002aa10) {
      uVar1 = *DAT_8002a9f8;
      while ((uVar1 & 0x1000000) == 0) {
        if (((DAT_8002aa10 + 1 & 0x3f) == DAT_8002aa0c) && (DAT_8002a8f0 == (code *)0x0)) {
          FUN_80021a3c(2,0);
        }
        uVar1 = *DAT_8002a9ec;
        while ((uVar1 & 0x4000000) == 0) {
          uVar1 = *DAT_8002a9ec;
        }
        (**(code **)(DAT_8002aa10 * 0x60 + -0x7ffd4db4))
                  (*(undefined4 *)(DAT_8002aa10 * 0x60 + -0x7ffd4db0),
                   *(undefined4 *)(DAT_8002aa10 * 0x60 + -0x7ffd4dac));
        DAT_8002aa10 = DAT_8002aa10 + 1 & 0x3f;
        if (DAT_8002aa0c == DAT_8002aa10) break;
        uVar1 = *DAT_8002a9f8;
      }
    }
    FUN_80021b58(DAT_8002aa18);
    if ((((DAT_8002aa0c == DAT_8002aa10) && ((*DAT_8002a9f8 & 0x1000000) == 0)) &&
        (DAT_8002a8ec != 0)) && (DAT_8002a8f0 != (code *)0x0)) {
      DAT_8002a8ec = 0;
      (*DAT_8002a8f0)();
    }
    uVar1 = DAT_8002aa0c - DAT_8002aa10 & 0x3f;
  }
  return uVar1;
}



// FUNCTION 80025044 FUN_80025044 [[80025044, 8002517f]]

undefined4 FUN_80025044(uint param_1)

{
  undefined4 uVar1;
  uint uVar2;
  
  DAT_8002aa1c = FUN_80021b58(0);
  DAT_8002aa10 = 0;
  DAT_8002aa0c = 0;
  uVar2 = param_1 & 7;
  if (uVar2 == 1) {
LAB_80025100:
    *DAT_8002a9f8 = 0x401;
    *DAT_8002aa08 = *DAT_8002aa08 | 0x800;
    *DAT_8002a9ec = 0x2000000;
    *DAT_8002a9ec = 0x1000000;
  }
  else {
    if (uVar2 < 2) {
      if (uVar2 != 0) goto LAB_8002514c;
    }
    else {
      if (uVar2 == 3) goto LAB_80025100;
      if (uVar2 != 5) goto LAB_8002514c;
    }
    *DAT_8002a9f8 = 0x401;
    *DAT_8002aa08 = *DAT_8002aa08 | 0x800;
    *DAT_8002a9ec = 0;
    FUN_80025914(0x8002b24c,0,0x1800);
  }
LAB_8002514c:
  FUN_80021b58(DAT_8002aa1c);
  uVar1 = 0;
  if ((param_1 & 7) == 0) {
    uVar1 = FUN_80025434(param_1);
  }
  return uVar1;
}



// FUNCTION 80025180 FUN_80025180 [[80025180, 800252bb]]

uint FUN_80025180(int param_1)

{
  int iVar1;
  uint uVar2;
  
  if (param_1 == 0) {
    FUN_800252bc();
    do {
      if (DAT_8002aa0c == DAT_8002aa10) {
        while (((*DAT_8002a9f8 & 0x1000000) != 0 || ((*DAT_8002a9ec & 0x4000000) == 0))) {
          iVar1 = FUN_800252f0();
          if (iVar1 != 0) {
            return 0xffffffff;
          }
        }
        return 0;
      }
      FUN_80024de4();
      iVar1 = FUN_800252f0();
    } while (iVar1 == 0);
    return 0xffffffff;
  }
  uVar2 = DAT_8002aa0c - DAT_8002aa10 & 0x3f;
  if (uVar2 != 0) {
    FUN_80024de4();
  }
  if (((*DAT_8002a9f8 & 0x1000000) == 0) && ((*DAT_8002a9ec & 0x4000000) != 0)) {
    return uVar2;
  }
  if (uVar2 != 0) {
    return uVar2;
  }
  return 1;
}



// FUNCTION 800252bc FUN_800252bc [[800252bc, 800252ef]]

void FUN_800252bc(void)

{
  int iVar1;
  
  iVar1 = FUN_80026a8c(0xffffffff);
  DAT_8002aa20 = iVar1 + 0xf0;
  DAT_8002aa24 = 0;
  return;
}



// FUNCTION 800252f0 FUN_800252f0 [[800252f0, 80025433]]

undefined4 FUN_800252f0(void)

{
  bool bVar1;
  int iVar2;
  undefined4 uVar3;
  
  iVar2 = FUN_80026a8c(0xffffffff);
  if ((DAT_8002aa20 < iVar2) ||
     (iVar2 = DAT_8002aa24 + 1, bVar1 = 0xf0000 < DAT_8002aa24, DAT_8002aa24 = iVar2, bVar1)) {
    FUN_800270dc(s_GPU_timeout_que__d_stat__08x_chc_800202e8,DAT_8002aa0c - DAT_8002aa10 & 0x3f,
                 *DAT_8002a9ec,*DAT_8002a9f8,*DAT_8002a9f0);
    DAT_8002aa1c = FUN_80021b58(0);
    DAT_8002aa10 = 0;
    DAT_8002aa0c = 0;
    *DAT_8002a9f8 = 0x401;
    *DAT_8002aa08 = *DAT_8002aa08 | 0x800;
    *DAT_8002a9ec = 0x2000000;
    *DAT_8002a9ec = 0x1000000;
    FUN_80021b58(DAT_8002aa1c);
    uVar3 = 0xffffffff;
  }
  else {
    uVar3 = 0;
  }
  return uVar3;
}



// FUNCTION 80025434 FUN_80025434 [[80025434, 800254d3]]

undefined8 FUN_80025434(uint param_1)

{
  uint *puVar1;
  undefined4 uVar2;
  uint *puVar3;
  
  *DAT_8002a9ec = 0x10000007;
  puVar1 = DAT_8002a9ec;
  puVar3 = (uint *)0xe1000000;
  if ((*DAT_8002a9e8 & 0xffffff) == 2) {
    if ((param_1 & 8) == 0) {
      uVar2 = 1;
    }
    else {
      uVar2 = 2;
      *DAT_8002a9ec = 0x9000001;
      puVar3 = puVar1;
    }
  }
  else {
    *DAT_8002a9e8 = *DAT_8002a9ec & 0x3fff | 0xe1001000;
    uVar2 = 0;
    puVar3 = (uint *)*DAT_8002a9e8;
  }
  return CONCAT44(puVar3,uVar2);
}



// FUNCTION 800254d4 FUN_800254d4 [[800254d4, 800255bf]]

undefined4 FUN_800254d4(undefined4 param_1,undefined4 param_2)

{
  int iVar1;
  uint uVar2;
  
  FUN_80022e20(s_LoadImage2_8002031c,param_1);
  iVar1 = FUN_80026a8c(0xffffffff);
  DAT_8002aa20 = iVar1 + 0xf0;
  DAT_8002aa24 = 0;
  uVar2 = *DAT_8002a9f8;
  while (((uVar2 & 0x1000000) != 0 || ((*DAT_8002a9ec & 0x4000000) == 0))) {
    iVar1 = FUN_800252f0();
    if (iVar1 != 0) {
      return 0xffffffff;
    }
    uVar2 = *DAT_8002a9f8;
  }
  FUN_80021a3c(2,FUN_800258ec);
  (**(code **)(PTR_PTR_8002a8dc + 0x20))(param_1,param_2);
  return 0;
}



// FUNCTION 800255c0 FUN_800255c0 [[800255c0, 800256ab]]

undefined4 FUN_800255c0(undefined4 param_1,undefined4 param_2)

{
  int iVar1;
  uint uVar2;
  
  FUN_80022e20(s_StoreImage_80020240,param_1);
  iVar1 = FUN_80026a8c(0xffffffff);
  DAT_8002aa20 = iVar1 + 0xf0;
  DAT_8002aa24 = 0;
  uVar2 = *DAT_8002a9f8;
  while (((uVar2 & 0x1000000) != 0 || ((*DAT_8002a9ec & 0x4000000) == 0))) {
    iVar1 = FUN_800252f0();
    if (iVar1 != 0) {
      return 0xffffffff;
    }
    uVar2 = *DAT_8002a9f8;
  }
  FUN_80021a3c(2,FUN_800258ec);
  (**(code **)(PTR_PTR_8002a8dc + 0x1c))(param_1,param_2);
  return 0;
}



// FUNCTION 800256ac FUN_800256ac [[800256ac, 800257ef]]

undefined4 FUN_800256ac(undefined4 *param_1,uint param_2,int param_3)

{
  int iVar1;
  uint uVar2;
  undefined4 uVar3;
  
  FUN_80022e20(s_MoveImage_8002024c,param_1);
  iVar1 = FUN_80026a8c(0xffffffff);
  DAT_8002aa20 = iVar1 + 0xf0;
  DAT_8002aa24 = 0;
  uVar2 = *DAT_8002a9f8;
  while (((uVar2 & 0x1000000) != 0 || ((*DAT_8002a9ec & 0x4000000) == 0))) {
    iVar1 = FUN_800252f0();
    if (iVar1 != 0) {
      return 0xffffffff;
    }
    uVar2 = *DAT_8002a9f8;
  }
  FUN_80021a3c(2,FUN_800258ec);
  uVar3 = 0xffffffff;
  if (*(short *)(param_1 + 1) != 0) {
    if (*(short *)((int)param_1 + 6) == 0) {
      uVar3 = 0xffffffff;
    }
    else {
      DAT_8002a988 = param_3 << 0x10 | param_2 & 0xffff;
      DAT_8002a984 = *param_1;
      DAT_8002a98c = param_1[1];
      (**(code **)(PTR_PTR_8002a8dc + 0x18))(&DAT_8002a97c);
      uVar3 = 0;
    }
  }
  return uVar3;
}



// FUNCTION 800258ec FUN_800258ec [[800258ec, 80025913]]

void FUN_800258ec(void)

{
  FUN_80021a3c(2,FUN_80024de4);
  return;
}



// FUNCTION 80025914 FUN_80025914 [[80025914, 80025937]]

void FUN_80025914(undefined1 *param_1,undefined1 param_2,int param_3)

{
  int iVar1;
  
  iVar1 = param_3 + -1;
  if (param_3 != 0) {
    do {
      *param_1 = param_2;
      iVar1 = iVar1 + -1;
      param_1 = param_1 + 1;
    } while (iVar1 != -1);
  }
  return;
}



// FUNCTION 8002593c FUN_8002593c [[8002593c, 800259cb]]

undefined4 FUN_8002593c(void)

{
  int iVar1;
  int iVar2;
  
  iVar2 = 4;
  do {
    iVar1 = FUN_800259cc();
    if (iVar1 == 1) {
      DAT_8002aa34 = FUN_80025a58;
      DAT_8002aa38 = 0;
      DAT_8002ab6c = FUN_80025a08;
      DAT_8002ab70 = FUN_80025a30;
      return 1;
    }
    iVar2 = iVar2 + -1;
  } while (iVar2 != -1);
  FUN_800270dc(s_CdInit__Init_failed_80020328);
  return 0;
}



// FUNCTION 800259cc FUN_800259cc [[800259cc, 80025a07]]

bool FUN_800259cc(void)

{
  bool bVar1;
  int iVar2;
  
  iVar2 = FUN_800283fc();
  if (iVar2 == 0) {
    iVar2 = FUN_800282c0();
    bVar1 = iVar2 == 0;
  }
  else {
    bVar1 = false;
  }
  return bVar1;
}



// FUNCTION 80025a08 FUN_80025a08 [[80025a08, 80025a2f]]

void FUN_80025a08(void)

{
  FUN_8002882c(0xf0000003,0x20);
  return;
}



// FUNCTION 80025a30 FUN_80025a30 [[80025a30, 80025a57]]

void FUN_80025a30(void)

{
  FUN_8002882c(0xf0000003,0x40);
  return;
}



// FUNCTION 80025a58 FUN_80025a58 [[80025a58, 80025a7f]]

void FUN_80025a58(void)

{
  FUN_8002882c(0xf0000003,0x40);
  return;
}



// FUNCTION 80025a8c FUN_80025a8c [[80025a8c, 80025d63]]

undefined4 * FUN_80025a8c(undefined4 *param_1,char *param_2)

{
  char cVar1;
  bool bVar2;
  char cVar3;
  int iVar4;
  undefined1 *puVar5;
  int iVar6;
  undefined4 uVar7;
  undefined4 uVar8;
  undefined4 uVar9;
  char *pcVar10;
  undefined4 *puVar11;
  char *pcVar12;
  int iVar13;
  char local_40 [32];
  
  if (DAT_8002aa48 != DAT_8002ab80) {
    iVar4 = FUN_80025d84();
    if (iVar4 == 0) {
      return (undefined4 *)0x0;
    }
    DAT_8002aa48 = DAT_8002ab80;
  }
  if (*param_2 != '\\') {
    return (undefined4 *)0x0;
  }
  local_40[0] = '\0';
  iVar4 = 1;
  iVar13 = 0;
  pcVar10 = param_2;
  do {
    cVar3 = *pcVar10;
    cVar1 = *pcVar10;
    pcVar12 = local_40;
    if (cVar3 != '\\') {
      do {
        bVar2 = iVar13 < 8;
        if (cVar1 == '\0') goto LAB_80025b98;
        pcVar10 = pcVar10 + 1;
        *pcVar12 = cVar1;
        cVar1 = *pcVar10;
        pcVar12 = pcVar12 + 1;
      } while (*pcVar10 != '\\');
      cVar3 = *pcVar10;
    }
    bVar2 = iVar13 < 8;
    if (cVar3 == '\0') goto LAB_80025b98;
    pcVar10 = pcVar10 + 1;
    *pcVar12 = '\0';
    iVar4 = FUN_80026048(iVar4,local_40);
    if (iVar4 == -1) {
      local_40[0] = '\0';
      break;
    }
    iVar13 = iVar13 + 1;
  } while (iVar13 < 8);
  bVar2 = iVar13 < 8;
LAB_80025b98:
  if (bVar2) {
    if (local_40[0] == '\0') {
      if (DAT_8002ab74 < 1) {
        return (undefined4 *)0x0;
      }
      pcVar10 = s__s__dir_was_not_found_80020364;
    }
    else {
      *pcVar12 = '\0';
      iVar4 = FUN_800260ec();
      if (iVar4 == 0) {
        if (0 < DAT_8002ab74) {
          FUN_800270dc(s_CdSearchFile__disc_error_8002037c);
          return (undefined4 *)0x0;
        }
        return (undefined4 *)0x0;
      }
      if (1 < DAT_8002ab74) {
        FUN_800270dc(s_CdSearchFile__searching__s____80020398,local_40);
      }
      iVar13 = 0;
      puVar5 = &DAT_8002ca54;
      puVar11 = (undefined4 *)&DAT_8002ca4c;
      iVar4 = 0;
      do {
        if ((&DAT_8002ca54)[iVar4] == '\0') break;
        iVar6 = FUN_80025d64(puVar5,local_40);
        if (iVar6 != 0) {
          if (1 < DAT_8002ab74) {
            FUN_800270dc(s__s__found_800203b8,local_40);
          }
          uVar7 = puVar11[1];
          uVar8 = puVar11[2];
          uVar9 = puVar11[3];
          *param_1 = *puVar11;
          param_1[1] = uVar7;
          param_1[2] = uVar8;
          param_1[3] = uVar9;
          uVar7 = puVar11[5];
          param_1[4] = puVar11[4];
          param_1[5] = uVar7;
          return puVar11;
        }
        puVar11 = puVar11 + 6;
        puVar5 = puVar5 + 0x18;
        iVar13 = iVar13 + 1;
        iVar4 = iVar4 + 0x18;
      } while (iVar13 < 0x40);
      param_2 = local_40;
      if (DAT_8002ab74 < 1) {
        return (undefined4 *)0x0;
      }
      pcVar10 = s__s__not_found_800203c4;
    }
    FUN_800270dc(pcVar10,param_2);
  }
  else if (0 < DAT_8002ab74) {
    FUN_800270dc(s__s__path_level___d__error_80020348,param_2,iVar13);
    return (undefined4 *)0x0;
  }
  return (undefined4 *)0x0;
}



// FUNCTION 80025d64 FUN_80025d64 [[80025d64, 80025d83]]

bool FUN_80025d64(undefined4 param_1,undefined4 param_2)

{
  int iVar1;
  
  iVar1 = FUN_8002883c(param_1,param_2,0xc);
  return iVar1 == 0;
}



// FUNCTION 80025d84 FUN_80025d84 [[80025d84, 80026047]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined4 FUN_80025d84(void)

{
  byte bVar1;
  undefined4 uVar2;
  int iVar3;
  undefined4 uVar4;
  byte *pbVar5;
  int iVar6;
  int iVar7;
  
  pbVar5 = &DAT_8002e64c;
  iVar3 = FUN_80026388(1,0x10,&DAT_8002e64c);
  if (iVar3 == 1) {
    iVar3 = FUN_8002883c(0x8002e64d,s_CD001_80020400,5);
    uVar2 = _DAT_8002e6d8;
    if (iVar3 == 0) {
      iVar3 = FUN_80026388(1,_DAT_8002e6d8,&DAT_8002e64c);
      if (iVar3 == 1) {
        if (1 < DAT_8002ab74) {
          FUN_800270dc(s_CD_newmedia__sarching_dir___8002045c);
        }
        iVar3 = 0;
        do {
          if (*pbVar5 == 0) break;
          iVar6 = iVar3 * 0x2c;
          *(undefined4 *)(iVar6 + -0x7ffd2fac) = *(undefined4 *)(pbVar5 + 2);
          iVar7 = iVar6 + -0x7ffd2fa8;
          bVar1 = pbVar5[6];
          iVar3 = iVar3 + 1;
          *(int *)(iVar6 + -0x7ffd2fb4) = iVar3;
          *(uint *)(iVar6 + -0x7ffd2fb0) = (uint)bVar1;
          FUN_8002729c(iVar7,pbVar5 + 8,*pbVar5);
          *(undefined1 *)(iVar7 + (uint)*pbVar5) = 0;
          pbVar5 = pbVar5 + (uint)*pbVar5 + (*pbVar5 & 1) + 8;
          if (1 < DAT_8002ab74) {
            FUN_800270dc(s__08x__04x__04x__s_8002047c,*(undefined4 *)(iVar6 + -0x7ffd2fac),
                         *(undefined4 *)(iVar6 + -0x7ffd2fb4),*(undefined4 *)(iVar6 + -0x7ffd2fb0),
                         iVar7);
          }
          if (0x7f < iVar3) goto LAB_80025ff0;
        } while (pbVar5 < &DAT_8002ee4c);
        if (iVar3 < 0x80) {
          *(undefined4 *)(iVar3 * 0x2c + -0x7ffd2fb0) = 0;
        }
LAB_80025ff0:
        DAT_8002aa44 = 0;
        uVar4 = 1;
        if (1 < DAT_8002ab74) {
          FUN_800270dc(s_CD_newmedia___d_dir_entries_foun_80020490,iVar3);
          uVar4 = 1;
        }
      }
      else {
        uVar4 = 0;
        if (0 < DAT_8002ab74) {
          FUN_800270dc(s_CD_newmedia__Read_error__PT__08x_80020438,uVar2);
          uVar4 = 0;
        }
      }
    }
    else {
      uVar4 = 0;
      if (0 < DAT_8002ab74) {
        FUN_800270dc(s_CD_newmedia__Disc_format_error_i_80020408);
        uVar4 = 0;
      }
    }
  }
  else {
    uVar4 = 0;
    if (0 < DAT_8002ab74) {
      FUN_800270dc(s_CD_newmedia__Read_error_in_cd_re_800203d4);
      uVar4 = 0;
    }
  }
  return uVar4;
}



// FUNCTION 80026048 FUN_80026048 [[80026048, 800260eb]]

int FUN_80026048(int param_1,undefined4 param_2)

{
  int iVar1;
  int iVar2;
  int iVar3;
  int iVar4;
  
  iVar2 = 0;
  iVar4 = -0x7ffd2fa8;
  iVar3 = 0;
  while( true ) {
    if (*(int *)(iVar3 + -0x7ffd2fb0) == 0) {
      return -1;
    }
    if ((*(int *)(iVar3 + -0x7ffd2fb0) == param_1) &&
       (iVar1 = FUN_8002884c(param_2,iVar4), iVar1 == 0)) break;
    iVar4 = iVar4 + 0x2c;
    iVar2 = iVar2 + 1;
    iVar3 = iVar3 + 0x2c;
    if (0x7f < iVar2) {
      return -1;
    }
  }
  return iVar2 + 1;
}



// FUNCTION 800260ec FUN_800260ec [[800260ec, 80026387]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined4 FUN_800260ec(int param_1)

{
  int iVar1;
  byte *pbVar2;
  int iVar3;
  undefined1 *puVar4;
  undefined1 *puVar5;
  
  if (param_1 != DAT_8002aa44) {
    pbVar2 = &DAT_8002e64c;
    iVar1 = FUN_80026388(1,*(undefined4 *)(param_1 * 0x2c + -0x7ffd2fd8),&DAT_8002e64c);
    if (iVar1 != 1) {
      if (DAT_8002ab74 < 1) {
        return 0xffffffff;
      }
      FUN_800270dc(s_CD_cachefile__dir_not_found_800204b4);
      return 0xffffffff;
    }
    if (1 < DAT_8002ab74) {
      FUN_800270dc(s_CD_cachefile__searching____800204d4);
    }
    iVar3 = 0;
    puVar5 = &DAT_8002ca4c;
    puVar4 = &DAT_8002ca54;
    iVar1 = 0;
    while (*pbVar2 != 0) {
      FUN_8002688c(*(undefined4 *)(pbVar2 + 2),puVar5);
      *(undefined4 *)(&DAT_8002ca50 + iVar1) = *(undefined4 *)(pbVar2 + 10);
      if (iVar3 == 0) {
        _DAT_8002ca54 = DAT_800204f0;
      }
      else if (iVar3 == 1) {
        _DAT_8002ca6c = DAT_800204f4;
        DAT_8002ca6e = DAT_800204f6;
      }
      else {
        FUN_8002729c(puVar4,pbVar2 + 0x21,pbVar2[0x20]);
        puVar4[pbVar2[0x20]] = 0;
      }
      if (1 < DAT_8002ab74) {
        FUN_800270dc(s___02x__02x__02x___8d__s_800204f8,(&DAT_8002ca4c)[iVar1],
                     *(undefined1 *)(iVar1 + -0x7ffd35b3),*(undefined1 *)(iVar1 + -0x7ffd35b2),
                     *(undefined4 *)(&DAT_8002ca50 + iVar1),puVar4);
      }
      puVar4 = puVar4 + 0x18;
      iVar1 = iVar1 + 0x18;
      iVar3 = iVar3 + 1;
      pbVar2 = pbVar2 + *pbVar2;
      puVar5 = puVar5 + 0x18;
      if ((0x3f < iVar3) || ((byte *)0x8002ee4b < pbVar2)) break;
    }
    DAT_8002aa44 = param_1;
    if (iVar3 < 0x40) {
      (&DAT_8002ca54)[iVar3 * 0x18] = 0;
    }
    if (DAT_8002ab74 < 2) {
      return 1;
    }
    FUN_800270dc(s_CD_cachefile___d_files_found_80020514,iVar3);
  }
  return 1;
}



// FUNCTION 80026388 FUN_80026388 [[80026388, 800263ef]]

bool FUN_80026388(undefined4 param_1,undefined4 param_2,undefined4 param_3)

{
  int iVar1;
  undefined1 auStack_18 [8];
  
  FUN_8002688c(param_2,auStack_18);
  FUN_800263fc(2,auStack_18,0);
  FUN_8002279c(param_1,param_3,0x80);
  iVar1 = FUN_80022938(0,0);
  return iVar1 == 0;
}



// FUNCTION 800263fc FUN_800263fc [[800263fc, 80026537]]

undefined4 FUN_800263fc(byte param_1,int param_2,undefined4 param_3)

{
  undefined4 uVar1;
  int iVar2;
  int iVar3;
  
  uVar1 = DAT_8002ab6c;
  iVar3 = 3;
  while( true ) {
    DAT_8002ab6c = 0;
    if ((param_1 != 1) && (((byte)DAT_8002ab78 & 0x10) != 0)) {
      FUN_80027d58(1,0,0,0);
    }
    if ((((param_2 == 0) || (*(int *)(&DAT_8002aa54 + (uint)param_1 * 4) == 0)) ||
        (iVar2 = FUN_80027d58(2,param_2,param_3,0), iVar2 == 0)) &&
       (DAT_8002ab6c = uVar1, iVar2 = FUN_80027d58(param_1,param_2,param_3,0), iVar2 == 0)) break;
    iVar3 = iVar3 + -1;
    if (iVar3 == -1) {
      DAT_8002ab6c = uVar1;
      return 0;
    }
  }
  return 1;
}



// FUNCTION 80026538 FUN_80026538 [[80026538, 8002666b]]

undefined4 FUN_80026538(byte param_1,int param_2)

{
  undefined4 uVar1;
  int iVar2;
  int iVar3;
  
  uVar1 = DAT_8002ab6c;
  iVar3 = 3;
  while( true ) {
    DAT_8002ab6c = 0;
    if ((param_1 != 1) && (((byte)DAT_8002ab78 & 0x10) != 0)) {
      FUN_80027d58(1,0,0,0);
    }
    if ((((param_2 == 0) || (*(int *)(&DAT_8002aa54 + (uint)param_1 * 4) == 0)) ||
        (iVar2 = FUN_80027d58(2,param_2,0,0), iVar2 == 0)) &&
       (DAT_8002ab6c = uVar1, iVar2 = FUN_80027d58(param_1,param_2,0,1), iVar2 == 0)) break;
    iVar3 = iVar3 + -1;
    if (iVar3 == -1) {
      DAT_8002ab6c = uVar1;
      return 0;
    }
  }
  return 1;
}



// FUNCTION 8002666c FUN_8002666c [[8002666c, 800267b7]]

bool FUN_8002666c(byte param_1,int param_2,undefined4 param_3)

{
  undefined4 uVar1;
  bool bVar2;
  int iVar3;
  int iVar4;
  int iVar5;
  
  uVar1 = DAT_8002ab6c;
  iVar5 = 3;
  do {
    DAT_8002ab6c = 0;
    if ((param_1 != 1) && (((byte)DAT_8002ab78 & 0x10) != 0)) {
      FUN_80027d58(1,0,0,0);
    }
    if (((param_2 == 0) || (*(int *)(&DAT_8002aa54 + (uint)param_1 * 4) == 0)) ||
       (iVar3 = FUN_80027d58(2,param_2,param_3,0), iVar3 == 0)) {
      DAT_8002ab6c = uVar1;
      iVar3 = FUN_80027d58(param_1,param_2,param_3,0);
      iVar4 = 0;
      if (iVar3 == 0) break;
    }
    iVar5 = iVar5 + -1;
    iVar4 = -1;
    DAT_8002ab6c = uVar1;
  } while (iVar5 != -1);
  if (iVar4 == 0) {
    iVar5 = FUN_80027810(0,param_3);
    bVar2 = iVar5 == 2;
  }
  else {
    bVar2 = false;
  }
  return bVar2;
}



// FUNCTION 800267bc FUN_800267bc [[800267bc, 800267c7]]

void FUN_800267bc(void)

{
  (*(code *)&LAB_000000a0)();
  return;
}



// FUNCTION 800267cc FUN_800267cc [[800267cc, 800267db]]

void FUN_800267cc(void)

{
  syscall(0);
  return;
}



// FUNCTION 800267dc FUN_800267dc [[800267dc, 800267ef]]

undefined4 FUN_800267dc(undefined4 param_1)

{
  undefined4 uVar1;
  
  uVar1 = DAT_8002aad4;
  DAT_8002aad4 = param_1;
  return uVar1;
}



// FUNCTION 800267f0 FUN_800267f0 [[800267f0, 800267ff]]

undefined4 FUN_800267f0(void)

{
  return DAT_8002aad4;
}



// FUNCTION 8002680c FUN_8002680c [[8002680c, 8002688b]]

int FUN_8002680c(byte *param_1)

{
  return (((uint)(*param_1 >> 4) * 10 + (*param_1 & 0xf)) * 0x3c +
         (uint)(param_1[1] >> 4) * 10 + (param_1[1] & 0xf)) * 0x4b +
         (uint)(param_1[2] >> 4) * 10 + (param_1[2] & 0xf) + -0x96;
}



// FUNCTION 8002688c FUN_8002688c [[8002688c, 8002698f]]

void FUN_8002688c(int param_1,char *param_2)

{
  int iVar1;
  int iVar2;
  int iVar3;
  
  iVar3 = (param_1 + 0x96) / 0x4b;
  iVar2 = (param_1 + 0x96) % 0x4b;
  iVar1 = iVar3 / 0x3c;
  iVar3 = iVar3 % 0x3c;
  param_2[2] = (char)iVar2 + (char)(iVar2 / 10) * '\x06';
  param_2[1] = (char)iVar3 + (char)(iVar3 / 10) * '\x06';
  *param_2 = (char)iVar1 + (char)(iVar1 / 10) * '\x06';
  return;
}



// FUNCTION 8002699c FUN_8002699c [[8002699c, 800269bb]]

void FUN_8002699c(void)

{
  FUN_8002885c(0);
  return;
}



// FUNCTION 800269bc FUN_800269bc [[800269bc, 800269c7]]

void FUN_800269bc(void)

{
  return;
}



// FUNCTION 800269cc FUN_800269cc [[800269cc, 80026a7f]]

void FUN_800269cc(undefined2 *param_1,undefined2 param_2,undefined2 param_3,undefined2 param_4,
                 int param_5)

{
  bool bVar1;
  int iVar2;
  
  iVar2 = FUN_800267f0();
  *param_1 = param_2;
  param_1[1] = param_3;
  param_1[2] = param_4;
  param_1[6] = 0;
  param_1[7] = 0;
  param_1[8] = 0;
  param_1[9] = 0;
  *(undefined1 *)((int)param_1 + 0x19) = 0;
  *(undefined1 *)(param_1 + 0xd) = 0;
  *(undefined1 *)((int)param_1 + 0x1b) = 0;
  *(undefined1 *)(param_1 + 0xb) = 1;
  param_1[3] = (short)param_5;
  if (iVar2 == 0) {
    bVar1 = param_5 < 0x101;
  }
  else {
    bVar1 = param_5 < 0x121;
  }
  *(bool *)((int)param_1 + 0x17) = bVar1;
  param_1[4] = param_2;
  param_1[5] = param_3;
  param_1[10] = 10;
  *(undefined1 *)(param_1 + 0xc) = 0;
  return;
}



// FUNCTION 80026a8c FUN_80026a8c [[80026a8c, 80026c03]]

uint FUN_80026a8c(int param_1)

{
  uint uVar1;
  int iVar2;
  uint uVar3;
  
  do {
  } while (*DAT_8002aaf0 != *DAT_8002aaf0);
  uVar3 = *DAT_8002aaf0 - DAT_8002aaf4 & 0xffff;
  uVar1 = DAT_8002ab24;
  if ((-1 < param_1) && (uVar1 = uVar3, param_1 != 1)) {
    uVar3 = DAT_8002aaf8;
    if (0 < param_1) {
      uVar3 = (DAT_8002aaf8 - 1) + param_1;
    }
    iVar2 = 0;
    if (0 < param_1) {
      iVar2 = param_1 + -1;
    }
    FUN_80026c04(uVar3,iVar2);
    uVar3 = *DAT_8002aaec;
    FUN_80026c04(DAT_8002ab24 + 1,1);
    if (((uVar3 & 0x400000) != 0) && (-1 < (int)(uVar3 ^ *DAT_8002aaec))) {
      do {
      } while (((uVar3 ^ *DAT_8002aaec) & 0x80000000) == 0);
    }
    DAT_8002aaf8 = DAT_8002ab24;
    do {
      DAT_8002aaf4 = *DAT_8002aaf0;
    } while (DAT_8002aaf4 != *DAT_8002aaf0);
  }
  return uVar1;
}



// FUNCTION 80026c04 FUN_80026c04 [[80026c04, 80026c9b]]

void FUN_80026c04(int param_1,int param_2)

{
  param_2 = param_2 << 0xf;
  do {
    if (param_1 <= DAT_8002ab24) {
      return;
    }
    param_2 = param_2 + -1;
  } while (param_2 != -1);
  FUN_800271e4(s_VSync__timeout_80020538);
  FUN_800270fc(0);
  FUN_8002710c(3,0);
  return;
}



// FUNCTION 80026c9c FUN_80026c9c [[80026c9c, 80026cd7]]

void FUN_80026c9c(undefined2 *param_1,undefined2 param_2,undefined2 param_3,undefined2 param_4,
                 undefined2 param_5)

{
  *param_1 = param_2;
  param_1[1] = param_3;
  param_1[2] = param_4;
  param_1[4] = 0;
  param_1[5] = 0;
  param_1[6] = 0;
  param_1[7] = 0;
  *(undefined1 *)((int)param_1 + 0x11) = 0;
  *(undefined1 *)(param_1 + 8) = 0;
  *(undefined1 *)((int)param_1 + 0x13) = 0;
  *(undefined1 *)(param_1 + 9) = 0;
  param_1[3] = param_5;
  return;
}



// FUNCTION 80026cdc FUN_80026cdc [[80026cdc, 80026ce7]]

void FUN_80026cdc(void)

{
  (*(code *)&LAB_000000a0)();
  return;
}



// FUNCTION 80026cec FUN_80026cec [[80026cec, 80026cf7]]

void FUN_80026cec(void)

{
  (*(code *)&LAB_000000b0)();
  return;
}



// FUNCTION 80026cfc FUN_80026cfc [[80026cfc, 80026d53]]

undefined1 * FUN_80026cfc(void)

{
  *DAT_8002ab28 = 0x100;
  DAT_8002ab24 = 0;
  FUN_80026dec(&DAT_8002ab04,8);
  FUN_80021a0c(0,FUN_80026d54);
  return &LAB_80026dc0;
}



// FUNCTION 80026d54 FUN_80026d54 [[80026d54, 80026dbf]]

void FUN_80026d54(void)

{
  undefined4 *puVar1;
  int iVar2;
  
  iVar2 = 0;
  puVar1 = &DAT_8002ab04;
  DAT_8002ab24 = DAT_8002ab24 + 1;
  do {
    if ((code *)*puVar1 != (code *)0x0) {
      (*(code *)*puVar1)();
    }
    iVar2 = iVar2 + 1;
    puVar1 = puVar1 + 1;
  } while (iVar2 < 8);
  return;
}



// FUNCTION 80026dec FUN_80026dec [[80026dec, 80026e0f]]

void FUN_80026dec(undefined4 *param_1,int param_2)

{
  int iVar1;
  
  iVar1 = param_2 + -1;
  if (param_2 != 0) {
    do {
      *param_1 = 0;
      iVar1 = iVar1 + -1;
      param_1 = param_1 + 1;
    } while (iVar1 != -1);
  }
  return;
}



// FUNCTION 80026e1c FUN_80026e1c [[80026e1c, 80026e67]]

undefined1 * FUN_80026e1c(void)

{
  FUN_80027094(&DAT_8002ab38,8);
  *DAT_8002ab34 = 0;
  FUN_80021a0c(3,FUN_80026e68);
  return &LAB_80026fe8;
}



// FUNCTION 80026e68 FUN_80026e68 [[80026e68, 80026fe7]]

void FUN_80026e68(void)

{
  int iVar1;
  int iVar2;
  uint uVar3;
  undefined4 *puVar4;
  
  uVar3 = *DAT_8002ab34 >> 0x18 & 0x7f;
  if (uVar3 != 0) {
    do {
      puVar4 = &DAT_8002ab38;
      for (iVar1 = 0; (uVar3 != 0 && (iVar1 < 7)); iVar1 = iVar1 + 1) {
        if ((uVar3 & 1) != 0) {
          *DAT_8002ab34 = *DAT_8002ab34 & (1 << (iVar1 + 0x18U & 0x1f) | 0xffffffU);
          if ((code *)*puVar4 != (code *)0x0) {
            (*(code *)*puVar4)();
          }
        }
        puVar4 = puVar4 + 1;
        uVar3 = uVar3 >> 1;
      }
      uVar3 = *DAT_8002ab34 >> 0x18 & 0x7f;
    } while (uVar3 != 0);
  }
  if (((*DAT_8002ab34 & 0xff000000) == 0x80000000) || ((*DAT_8002ab34 & 0x8000) != 0)) {
    FUN_800270dc(s_DMA_bus_error__code__08x_80020548,*DAT_8002ab34);
    iVar1 = 0;
    do {
      iVar2 = iVar1 + 1;
      FUN_800270dc(s_MADR__d___08x_80020564,iVar1,*(undefined4 *)(iVar1 * 0x10 + DAT_8002ab58));
      iVar1 = iVar2;
    } while (iVar2 < 7);
  }
  return;
}



// FUNCTION 80027094 FUN_80027094 [[80027094, 800270b7]]

void FUN_80027094(undefined4 *param_1,int param_2)

{
  int iVar1;
  
  iVar1 = param_2 + -1;
  if (param_2 != 0) {
    do {
      *param_1 = 0;
      iVar1 = iVar1 + -1;
      param_1 = param_1 + 1;
    } while (iVar1 != -1);
  }
  return;
}



// FUNCTION 800270c4 FUN_800270c4 [[800270c4, 800270cf]]

void FUN_800270c4(void)

{
  (*(code *)&LAB_000000a0)();
  return;
}



// FUNCTION 800270dc FUN_800270dc [[800270dc, 800270e7]]

void FUN_800270dc(void)

{
  (*(code *)&LAB_000000a0)();
  return;
}



// FUNCTION 800270ec FUN_800270ec [[800270ec, 800270f7]]

void FUN_800270ec(void)

{
  (*(code *)&LAB_000000b0)();
  return;
}



// FUNCTION 800270fc FUN_800270fc [[800270fc, 80027107]]

void FUN_800270fc(void)

{
  (*(code *)&LAB_000000b0)();
  return;
}



// FUNCTION 8002710c FUN_8002710c [[8002710c, 80027117]]

void FUN_8002710c(void)

{
  (*(code *)&LAB_000000c0)();
  return;
}



// FUNCTION 8002711c FUN_8002711c [[8002711c, 80027127]]

void FUN_8002711c(void)

{
  (*(code *)&LAB_000000b0)();
  return;
}



// FUNCTION 8002712c FUN_8002712c [[8002712c, 8002713f]]

undefined4 FUN_8002712c(undefined4 param_1)

{
  undefined4 uVar1;
  
  uVar1 = DAT_8002ab6c;
  DAT_8002ab6c = param_1;
  return uVar1;
}



// FUNCTION 8002714c FUN_8002714c [[8002714c, 8002716f]]

void FUN_8002714c(undefined4 param_1)

{
  FUN_80021a3c(3,param_1);
  return;
}



// FUNCTION 8002717c FUN_8002717c [[8002717c, 8002719b]]

bool FUN_8002717c(void)

{
  int iVar1;
  
  iVar1 = FUN_800289bc();
  return iVar1 == 0;
}



// FUNCTION 8002719c FUN_8002719c [[8002719c, 800271bb]]

void FUN_8002719c(void)

{
  FUN_800285dc();
  return;
}



// FUNCTION 800271bc FUN_800271bc [[800271bc, 800271db]]

bool FUN_800271bc(void)

{
  int iVar1;
  
  iVar1 = FUN_80028aac();
  return iVar1 == 0;
}



// FUNCTION 800271e4 FUN_800271e4 [[800271e4, 800271ef]]

void FUN_800271e4(void)

{
  (*(code *)&LAB_000000b0)();
  return;
}



// FUNCTION 800271fc FUN_800271fc [[800271fc, 8002720f]]

undefined4 FUN_800271fc(undefined4 param_1)

{
  undefined4 uVar1;
  
  uVar1 = DAT_8002ab70;
  DAT_8002ab70 = param_1;
  return uVar1;
}



// FUNCTION 8002721c FUN_8002721c [[8002721c, 8002722b]]

undefined1 FUN_8002721c(void)

{
  return (undefined1)DAT_8002ab78;
}



// FUNCTION 8002722c FUN_8002722c [[8002722c, 80027237]]

undefined1 * FUN_8002722c(void)

{
  return &DAT_8002ab84;
}



// FUNCTION 8002723c FUN_8002723c [[8002723c, 8002725b]]

void FUN_8002723c(void)

{
  FUN_800281ec();
  return;
}



// FUNCTION 8002725c FUN_8002725c [[8002725c, 8002726b]]

undefined1 FUN_8002725c(void)

{
  return DAT_8002ab88;
}



// FUNCTION 8002726c FUN_8002726c [[8002726c, 8002728b]]

void FUN_8002726c(void)

{
  FUN_80027a90();
  return;
}



// FUNCTION 8002728c FUN_8002728c [[8002728c, 80027297]]

void FUN_8002728c(void)

{
  (*(code *)&LAB_000000a0)();
  return;
}



// FUNCTION 8002729c FUN_8002729c [[8002729c, 800272a7]]

void FUN_8002729c(void)

{
  (*(code *)&LAB_000000a0)();
  return;
}



// FUNCTION 800272ac FUN_800272ac [[800272ac, 8002780f]]

undefined4 FUN_800272ac(void)

{
  byte bVar1;
  undefined4 uVar2;
  byte *pbVar3;
  byte *pbVar4;
  int iVar5;
  int iVar6;
  uint uVar7;
  byte local_20;
  byte local_18 [8];
  
  *DAT_8002ae30 = 1;
  local_20 = *DAT_8002ae34 & 7;
  uVar7 = 0;
  if (local_20 == 0) {
LAB_800277f8:
    uVar2 = 0;
  }
  else {
    while (iVar5 = 0, local_20 != (*DAT_8002ae34 & 7)) {
      local_20 = *DAT_8002ae34 & 7;
    }
    do {
      pbVar3 = local_18 + iVar5;
      iVar6 = iVar5;
      if ((*DAT_8002ae30 & 0x20) == 0) break;
      iVar5 = iVar5 + 1;
      *pbVar3 = *DAT_8002ae3c;
      iVar6 = iVar5;
    } while (iVar5 < 8);
    for (; iVar5 < 8; iVar5 = iVar5 + 1) {
      local_18[iVar5] = 0;
    }
    *DAT_8002ae30 = 1;
    *DAT_8002ae34 = 7;
    *DAT_8002ae40 = 7;
    if ((local_20 != 3) || (*(int *)(&DAT_8002ad30 + (uint)DAT_8002ab89 * 4) != 0)) {
      if (((DAT_8002ab78 & 0x10) == 0) && ((local_18[0] & 0x10) != 0)) {
        DAT_8002ab80 = DAT_8002ab80 + 1;
      }
      DAT_8002ab78 = (uint)local_18[0];
      DAT_8002ab7c = (uint)local_18[1];
      uVar7 = DAT_8002ab78 & 0x1d;
    }
    if (((local_20 == 5) && (2 < DAT_8002ab74)) &&
       (FUN_800270dc(s_DiskError__800206e0), 2 < DAT_8002ab74)) {
      FUN_800270dc(s_com__s_code___02x__02x__800206ec,(&PTR_s_CdlSync_8002ab90)[DAT_8002ab89],
                   DAT_8002ab78,DAT_8002ab7c);
    }
    switch(local_20) {
    case 1:
      if ((uVar7 != 0) && (iVar6 == 1)) {
        uVar7 = 0;
      }
      DAT_8002ae49 = 1;
      if (uVar7 != 0) {
        DAT_8002ae49 = 5;
      }
      pbVar3 = &DAT_8002ee54;
      pbVar4 = local_18;
      iVar5 = 7;
      do {
        bVar1 = *pbVar4;
        pbVar4 = pbVar4 + 1;
        iVar5 = iVar5 + -1;
        *pbVar3 = bVar1;
        pbVar3 = pbVar3 + 1;
      } while (iVar5 != -1);
      *DAT_8002ae30 = 0;
      uVar2 = 4;
      *DAT_8002ae34 = 0;
      break;
    case 2:
      DAT_8002ae48 = 2;
      if (uVar7 != 0) {
        DAT_8002ae48 = 5;
      }
      pbVar3 = &DAT_8002ee4c;
      pbVar4 = local_18;
      iVar5 = 7;
      do {
        bVar1 = *pbVar4;
        pbVar4 = pbVar4 + 1;
        iVar5 = iVar5 + -1;
        *pbVar3 = bVar1;
        pbVar3 = pbVar3 + 1;
      } while (iVar5 != -1);
      uVar2 = 2;
      break;
    case 3:
      if (uVar7 == 0) {
        if (*(int *)(&DAT_8002ac30 + (uint)DAT_8002ab89 * 4) == 0) {
          DAT_8002ae48 = 2;
          pbVar3 = &DAT_8002ee4c;
          pbVar4 = local_18;
          iVar5 = 7;
          do {
            bVar1 = *pbVar4;
            pbVar4 = pbVar4 + 1;
            iVar5 = iVar5 + -1;
            *pbVar3 = bVar1;
            pbVar3 = pbVar3 + 1;
          } while (iVar5 != -1);
          uVar2 = 2;
        }
        else {
          DAT_8002ae48 = 3;
          pbVar3 = &DAT_8002ee4c;
          pbVar4 = local_18;
          iVar5 = 7;
          do {
            bVar1 = *pbVar4;
            pbVar4 = pbVar4 + 1;
            iVar5 = iVar5 + -1;
            *pbVar3 = bVar1;
            pbVar3 = pbVar3 + 1;
          } while (iVar5 != -1);
          uVar2 = 1;
        }
      }
      else {
        DAT_8002ae48 = 5;
        pbVar3 = &DAT_8002ee4c;
        pbVar4 = local_18;
        iVar5 = 7;
        do {
          bVar1 = *pbVar4;
          pbVar4 = pbVar4 + 1;
          iVar5 = iVar5 + -1;
          *pbVar3 = bVar1;
          pbVar3 = pbVar3 + 1;
        } while (iVar5 != -1);
        uVar2 = 2;
      }
      break;
    case 4:
      pbVar3 = &DAT_8002ee5c;
      DAT_8002ae4a = 4;
      pbVar4 = local_18;
      DAT_8002ae49 = 4;
      iVar5 = 7;
      do {
        bVar1 = *pbVar4;
        pbVar4 = pbVar4 + 1;
        iVar5 = iVar5 + -1;
        *pbVar3 = bVar1;
        pbVar3 = pbVar3 + 1;
      } while (iVar5 != -1);
      pbVar3 = &DAT_8002ee54;
      pbVar4 = local_18;
      iVar5 = 7;
      do {
        bVar1 = *pbVar4;
        pbVar4 = pbVar4 + 1;
        iVar5 = iVar5 + -1;
        *pbVar3 = bVar1;
        pbVar3 = pbVar3 + 1;
      } while (iVar5 != -1);
      uVar2 = 4;
      break;
    case 5:
      pbVar3 = &DAT_8002ee4c;
      DAT_8002ae49 = 5;
      pbVar4 = local_18;
      DAT_8002ae48 = 5;
      iVar5 = 7;
      do {
        bVar1 = *pbVar4;
        pbVar4 = pbVar4 + 1;
        iVar5 = iVar5 + -1;
        *pbVar3 = bVar1;
        pbVar3 = pbVar3 + 1;
      } while (iVar5 != -1);
      pbVar3 = &DAT_8002ee54;
      pbVar4 = local_18;
      iVar5 = 7;
      do {
        bVar1 = *pbVar4;
        pbVar4 = pbVar4 + 1;
        iVar5 = iVar5 + -1;
        *pbVar3 = bVar1;
        pbVar3 = pbVar3 + 1;
      } while (iVar5 != -1);
      uVar2 = 6;
      break;
    default:
      FUN_800271e4(s_CDROM__unknown_intr_80020708);
      FUN_800270dc(s___d__8002071c,local_20);
      goto LAB_800277f8;
    }
  }
  return uVar2;
}



// FUNCTION 80027810 FUN_80027810 [[80027810, 80027a8f]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

uint FUN_80027810(int param_1,undefined1 *param_2)

{
  byte bVar1;
  undefined1 uVar2;
  bool bVar3;
  int iVar4;
  uint uVar5;
  undefined1 *puVar6;
  
  _DAT_8002ee64 = FUN_80026a8c(0xffffffff);
  _DAT_8002ee64 = _DAT_8002ee64 + 0x3c0;
  _DAT_8002ee68 = 0;
  _DAT_8002ee6c = s_CD_sync_8002073c;
  while( true ) {
    iVar4 = FUN_80026a8c(0xffffffff);
    if ((_DAT_8002ee64 < iVar4) ||
       (iVar4 = _DAT_8002ee68 + 1, bVar3 = 0x3c0000 < _DAT_8002ee68, _DAT_8002ee68 = iVar4, bVar3))
    {
      FUN_800271e4(s_CD_timeout__800206b4);
      FUN_800270dc(s__s___s__Sync__s__Ready__s_800206c4,_DAT_8002ee6c,
                   (&PTR_s_CdlSync_8002ab90)[DAT_8002ab89],(&PTR_s_NoIntr_8002ac10)[DAT_8002ae48],
                   (&PTR_s_NoIntr_8002ac10)[DAT_8002ae49]);
      FUN_800281ec();
      iVar4 = -1;
    }
    else {
      iVar4 = 0;
    }
    if (iVar4 != 0) {
      return 0xffffffff;
    }
    iVar4 = FUN_80021b30();
    if (iVar4 != 0) {
      bVar1 = *DAT_8002ae30;
      while( true ) {
        uVar5 = FUN_800272ac();
        if (uVar5 == 0) break;
        if (((uVar5 & 4) != 0) && (DAT_8002ab70 != (code *)0x0)) {
          (*DAT_8002ab70)(DAT_8002ae49,&DAT_8002ee54);
        }
        if (((uVar5 & 2) != 0) && (DAT_8002ab6c != (code *)0x0)) {
          (*DAT_8002ab6c)(DAT_8002ae48,&DAT_8002ee4c);
        }
      }
      *DAT_8002ae30 = bVar1 & 3;
    }
    uVar5 = (uint)DAT_8002ae48;
    if ((uVar5 == 2) || (uVar5 == 5)) break;
    if (param_1 != 0) {
      return 0;
    }
  }
  DAT_8002ae48 = 2;
  puVar6 = &DAT_8002ee4c;
  iVar4 = 7;
  if (param_2 == (undefined1 *)0x0) {
    DAT_8002ae48 = 2;
    return uVar5;
  }
  do {
    uVar2 = *puVar6;
    puVar6 = puVar6 + 1;
    iVar4 = iVar4 + -1;
    *param_2 = uVar2;
    param_2 = param_2 + 1;
  } while (iVar4 != -1);
  return uVar5;
}



// FUNCTION 80027a90 FUN_80027a90 [[80027a90, 80027d57]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

uint FUN_80027a90(int param_1,undefined1 *param_2)

{
  byte bVar1;
  undefined1 uVar2;
  bool bVar3;
  int iVar4;
  uint uVar5;
  undefined1 *puVar6;
  
  _DAT_8002ee64 = FUN_80026a8c(0xffffffff);
  _DAT_8002ee64 = _DAT_8002ee64 + 0x3c0;
  _DAT_8002ee68 = 0;
  _DAT_8002ee6c = s_CD_ready_80020744;
  while( true ) {
    iVar4 = FUN_80026a8c(0xffffffff);
    if ((_DAT_8002ee64 < iVar4) ||
       (iVar4 = _DAT_8002ee68 + 1, bVar3 = 0x3c0000 < _DAT_8002ee68, _DAT_8002ee68 = iVar4, bVar3))
    {
      FUN_800271e4(s_CD_timeout__800206b4);
      FUN_800270dc(s__s___s__Sync__s__Ready__s_800206c4,_DAT_8002ee6c,
                   (&PTR_s_CdlSync_8002ab90)[DAT_8002ab89],(&PTR_s_NoIntr_8002ac10)[DAT_8002ae48],
                   (&PTR_s_NoIntr_8002ac10)[DAT_8002ae49]);
      FUN_800281ec();
      iVar4 = -1;
    }
    else {
      iVar4 = 0;
    }
    if (iVar4 != 0) {
      return 0xffffffff;
    }
    iVar4 = FUN_80021b30();
    if (iVar4 != 0) {
      bVar1 = *DAT_8002ae30;
      while( true ) {
        uVar5 = FUN_800272ac();
        if (uVar5 == 0) break;
        if (((uVar5 & 4) != 0) && (DAT_8002ab70 != (code *)0x0)) {
          (*DAT_8002ab70)(DAT_8002ae49,&DAT_8002ee54);
        }
        if (((uVar5 & 2) != 0) && (DAT_8002ab6c != (code *)0x0)) {
          (*DAT_8002ab6c)(DAT_8002ae48,&DAT_8002ee4c);
        }
      }
      *DAT_8002ae30 = bVar1 & 3;
    }
    uVar5 = (uint)DAT_8002ae4a;
    if (uVar5 != 0) break;
    uVar5 = (uint)DAT_8002ae49;
    if (uVar5 != 0) {
      DAT_8002ae49 = 0;
      puVar6 = &DAT_8002ee54;
      iVar4 = 7;
      if (param_2 == (undefined1 *)0x0) {
        DAT_8002ae49 = 0;
        return uVar5;
      }
      do {
        uVar2 = *puVar6;
        puVar6 = puVar6 + 1;
        iVar4 = iVar4 + -1;
        *param_2 = uVar2;
        param_2 = param_2 + 1;
      } while (iVar4 != -1);
      return uVar5;
    }
    if (param_1 != 0) {
      return 0;
    }
  }
  DAT_8002ae4a = 0;
  puVar6 = &DAT_8002ee5c;
  if (param_2 == (undefined1 *)0x0) {
    DAT_8002ae4a = 0;
    return uVar5;
  }
  iVar4 = 7;
  do {
    uVar2 = *puVar6;
    puVar6 = puVar6 + 1;
    iVar4 = iVar4 + -1;
    *param_2 = uVar2;
    param_2 = param_2 + 1;
  } while (iVar4 != -1);
  return uVar5;
}



// FUNCTION 80027d58 FUN_80027d58 [[80027d58, 80028163]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined4 FUN_80027d58(byte param_1,undefined1 *param_2,undefined1 *param_3,int param_4)

{
  byte bVar1;
  undefined1 uVar2;
  bool bVar3;
  undefined4 uVar4;
  undefined1 *puVar5;
  uint uVar6;
  int iVar7;
  int iVar8;
  
  if (1 < DAT_8002ab74) {
    FUN_800270dc(s__s____80020750,(&PTR_s_CdlSync_8002ab90)[param_1]);
  }
  if ((*(int *)(&DAT_8002adb0 + (uint)param_1 * 4) == 0) || (param_2 != (undefined1 *)0x0)) {
    FUN_80027810(0,0);
    if (param_1 == 2) {
      iVar7 = 0;
      puVar5 = param_2;
      do {
        (&DAT_8002ab84)[iVar7] = *puVar5;
        iVar7 = iVar7 + 1;
        puVar5 = param_2 + iVar7;
      } while (iVar7 < 4);
    }
    if (param_1 == 0xe) {
      DAT_8002ab88 = *param_2;
    }
    iVar7 = (uint)param_1 * 4;
    DAT_8002ae48 = 0;
    if (*(int *)(&DAT_8002acb0 + iVar7) != 0) {
      DAT_8002ae49 = 0;
    }
    *DAT_8002ae30 = 0;
    iVar8 = 0;
    puVar5 = param_2;
    if (0 < *(int *)(&DAT_8002adb0 + iVar7)) {
      do {
        *DAT_8002ae40 = *puVar5;
        iVar8 = iVar8 + 1;
        puVar5 = param_2 + iVar8;
      } while (iVar8 < *(int *)(&DAT_8002adb0 + iVar7));
    }
    DAT_8002ab89 = param_1;
    *DAT_8002ae3c = param_1;
    uVar4 = 0;
    if (param_4 == 0) {
      _DAT_8002ee64 = FUN_80026a8c(0xffffffff);
      _DAT_8002ee64 = _DAT_8002ee64 + 0x3c0;
      _DAT_8002ee68 = 0;
      _DAT_8002ee6c = s_CD_cw_80020768;
      while (DAT_8002ae48 == 0) {
        iVar7 = FUN_80026a8c(0xffffffff);
        if ((_DAT_8002ee64 < iVar7) ||
           (iVar7 = _DAT_8002ee68 + 1, bVar3 = 0x3c0000 < _DAT_8002ee68, _DAT_8002ee68 = iVar7,
           bVar3)) {
          FUN_800271e4(s_CD_timeout__800206b4);
          FUN_800270dc(s__s___s__Sync__s__Ready__s_800206c4,_DAT_8002ee6c,
                       (&PTR_s_CdlSync_8002ab90)[DAT_8002ab89],
                       (&PTR_s_NoIntr_8002ac10)[DAT_8002ae48],(&PTR_s_NoIntr_8002ac10)[DAT_8002ae49]
                      );
          FUN_800281ec();
          iVar7 = -1;
        }
        else {
          iVar7 = 0;
        }
        if (iVar7 != 0) {
          return 0xffffffff;
        }
        iVar7 = FUN_80021b30();
        if (iVar7 != 0) {
          bVar1 = *DAT_8002ae30;
          while( true ) {
            uVar6 = FUN_800272ac();
            if (uVar6 == 0) break;
            if (((uVar6 & 4) != 0) && (DAT_8002ab70 != (code *)0x0)) {
              (*DAT_8002ab70)(DAT_8002ae49,&DAT_8002ee54);
            }
            if (((uVar6 & 2) != 0) && (DAT_8002ab6c != (code *)0x0)) {
              (*DAT_8002ab6c)(DAT_8002ae48,&DAT_8002ee4c);
            }
          }
          *DAT_8002ae30 = bVar1 & 3;
        }
      }
      puVar5 = &DAT_8002ee4c;
      iVar7 = 7;
      if (param_3 != (undefined1 *)0x0) {
        do {
          uVar2 = *puVar5;
          puVar5 = puVar5 + 1;
          iVar7 = iVar7 + -1;
          *param_3 = uVar2;
          param_3 = param_3 + 1;
        } while (iVar7 != -1);
      }
      uVar4 = 0;
      if (DAT_8002ae48 == 5) {
        uVar4 = 0xffffffff;
      }
    }
  }
  else {
    uVar4 = 0xfffffffe;
    if (0 < DAT_8002ab74) {
      FUN_800270dc(s__s__no_param_80020758,(&PTR_s_CdlSync_8002ab90)[param_1]);
      uVar4 = 0xfffffffe;
    }
  }
  return uVar4;
}



// FUNCTION 800281ec FUN_800281ec [[800281ec, 800282bf]]

void FUN_800281ec(void)

{
  byte bVar1;
  
  *DAT_8002ae30 = 1;
  bVar1 = *DAT_8002ae34;
  while ((bVar1 & 7) != 0) {
    *DAT_8002ae30 = 1;
    *DAT_8002ae34 = 7;
    *DAT_8002ae40 = 7;
    bVar1 = *DAT_8002ae34;
  }
  DAT_8002ae4a = 0;
  DAT_8002ae49 = 0;
  DAT_8002ae48 = 2;
  *DAT_8002ae30 = 0;
  *DAT_8002ae34 = 0;
  *DAT_8002ae38 = 0x1325;
  return;
}



// FUNCTION 800282c0 FUN_800282c0 [[800282c0, 800283af]]

undefined4 FUN_800282c0(void)

{
  int iVar1;
  
  iVar1 = DAT_8002ae44;
  if ((*(short *)(DAT_8002ae44 + 0x1b8) == 0) && (*(short *)(DAT_8002ae44 + 0x1ba) == 0)) {
    *(undefined2 *)(DAT_8002ae44 + 0x180) = 0x3fff;
    *(undefined2 *)(iVar1 + 0x182) = 0x3fff;
  }
  iVar1 = DAT_8002ae44;
  *(undefined2 *)(DAT_8002ae44 + 0x1b0) = 0x3fff;
  *(undefined2 *)(iVar1 + 0x1b2) = 0x3fff;
  *(undefined2 *)(iVar1 + 0x1aa) = 0xc001;
  *DAT_8002ae30 = 2;
  *DAT_8002ae40 = 0x80;
  *DAT_8002ae34 = 0;
  *DAT_8002ae30 = 3;
  *DAT_8002ae3c = 0x80;
  *DAT_8002ae40 = 0;
  *DAT_8002ae34 = 0x20;
  return 0;
}



// FUNCTION 800283b0 FUN_800283b0 [[800283b0, 800283fb]]

void FUN_800283b0(void)

{
  DAT_8002ab70 = 0;
  DAT_8002ab6c = 0;
  DAT_8002ab7c = 0;
  DAT_8002ab78 = 0;
  FUN_800219dc();
  FUN_80021a0c(2,FUN_80028750);
  return;
}



// FUNCTION 800283fc FUN_800283fc [[800283fc, 800285db]]

undefined4 FUN_800283fc(void)

{
  byte bVar1;
  int iVar2;
  undefined4 uVar3;
  
  FUN_800271e4(s_CD_init__800207a8);
  FUN_800270dc(s_addr__08x_800207b4,&PTR_DAT_8002ae4c);
  DAT_8002ab89 = 0;
  DAT_8002ab88 = 0;
  DAT_8002ab70 = 0;
  DAT_8002ab6c = 0;
  DAT_8002ab7c = 0;
  DAT_8002ab78 = 0;
  FUN_800219dc();
  FUN_80021a0c(2,FUN_80028750);
  *DAT_8002ae30 = 1;
  bVar1 = *DAT_8002ae34;
  while ((bVar1 & 7) != 0) {
    *DAT_8002ae30 = 1;
    *DAT_8002ae34 = 7;
    *DAT_8002ae40 = 7;
    bVar1 = *DAT_8002ae34;
  }
  DAT_8002ae4a = 0;
  DAT_8002ae49 = 0;
  DAT_8002ae48 = 2;
  *DAT_8002ae30 = 0;
  *DAT_8002ae34 = 0;
  *DAT_8002ae38 = 0x1325;
  FUN_80027d58(1,0,0,0);
  if ((DAT_8002ab78 & 0x10) != 0) {
    FUN_80027d58(1,0,0,0);
  }
  iVar2 = FUN_80027d58(10,0,0,0);
  uVar3 = 0xffffffff;
  if (iVar2 == 0) {
    iVar2 = FUN_80027d58(0xc,0,0,0);
    if (iVar2 == 0) {
      iVar2 = FUN_80027810(0,0);
      uVar3 = 0xffffffff;
      if (iVar2 == 2) {
        uVar3 = 0;
      }
    }
    else {
      uVar3 = 0xffffffff;
    }
  }
  return uVar3;
}



// FUNCTION 800285dc FUN_800285dc [[800285dc, 80028743]]

/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

undefined4 FUN_800285dc(int param_1)

{
  bool bVar1;
  int iVar2;
  undefined4 uVar3;
  
  _DAT_8002ee64 = FUN_80026a8c(0xffffffff);
  _DAT_8002ee64 = _DAT_8002ee64 + 0x3c0;
  _DAT_8002ee68 = 0;
  _DAT_8002ee6c = s_CD_datasync_800207c0;
  do {
    iVar2 = FUN_80026a8c(0xffffffff);
    if ((_DAT_8002ee64 < iVar2) ||
       (iVar2 = _DAT_8002ee68 + 1, bVar1 = 0x3c0000 < _DAT_8002ee68, _DAT_8002ee68 = iVar2, bVar1))
    {
      FUN_800271e4(s_CD_timeout__800206b4);
      FUN_800270dc(s__s___s__Sync__s__Ready__s_800206c4,_DAT_8002ee6c,
                   (&PTR_s_CdlSync_8002ab90)[DAT_8002ab89],(&PTR_s_NoIntr_8002ac10)[DAT_8002ae48],
                   (&PTR_s_NoIntr_8002ac10)[DAT_8002ae49]);
      FUN_800281ec();
      iVar2 = -1;
    }
    else {
      iVar2 = 0;
    }
    uVar3 = 0xffffffff;
  } while (((iVar2 == 0) && (uVar3 = 0, (*DAT_8002ae64 & 0x1000000) != 0)) &&
          (uVar3 = 1, param_1 == 0));
  return uVar3;
}



// FUNCTION 80028750 FUN_80028750 [[80028750, 80028827]]

void FUN_80028750(void)

{
  byte bVar1;
  uint uVar2;
  
  bVar1 = *DAT_8002ae30;
  while( true ) {
    uVar2 = FUN_800272ac();
    if (uVar2 == 0) break;
    if (((uVar2 & 4) != 0) && (DAT_8002ab70 != (code *)0x0)) {
      (*DAT_8002ab70)(DAT_8002ae49,&DAT_8002ee54);
    }
    if (((uVar2 & 2) != 0) && (DAT_8002ab6c != (code *)0x0)) {
      (*DAT_8002ab6c)(DAT_8002ae48,&DAT_8002ee4c);
    }
  }
  *DAT_8002ae30 = bVar1 & 3;
  return;
}



// FUNCTION 8002882c FUN_8002882c [[8002882c, 80028837]]

void FUN_8002882c(void)

{
  (*(code *)&LAB_000000b0)();
  return;
}



// FUNCTION 8002883c FUN_8002883c [[8002883c, 80028847]]

void FUN_8002883c(void)

{
  (*(code *)&LAB_000000a0)();
  return;
}



// FUNCTION 8002884c FUN_8002884c [[8002884c, 80028857]]

void FUN_8002884c(void)

{
  (*(code *)&LAB_000000a0)();
  return;
}



// FUNCTION 8002885c FUN_8002885c [[8002885c, 80028943]]

void FUN_8002885c(int param_1)

{
  undefined2 *puVar1;
  int iVar2;
  
  FUN_800219dc();
  FUN_80028bac(param_1);
  if (param_1 == 0) {
    iVar2 = 0x17;
    puVar1 = &DAT_8002aede;
    do {
      *puVar1 = 0xc000;
      iVar2 = iVar2 + -1;
      puVar1 = puVar1 + -1;
    } while (-1 < iVar2);
  }
  FUN_80028944();
  DAT_8002ae88 = 0;
  DAT_8002ae8c = 0;
  DAT_8002ae98 = 0;
  DAT_8002ae9c = 0;
  DAT_8002ae9e = 0;
  DAT_8002aea0 = 0;
  DAT_8002aea4 = 0;
  DAT_8002ae90 = DAT_8002af94;
  FUN_800294b8(0xd1,DAT_8002af94,0);
  DAT_8002afc4 = 0;
  DAT_8002afc8 = 0;
  DAT_8002afcc = 0;
  DAT_8002ae84 = 0;
  DAT_8002af50 = 0;
  DAT_8002ae80 = 0;
  DAT_8002aeac = 0;
  DAT_8002aea8 = 0;
  DAT_8002aee0 = 0;
  return;
}



// FUNCTION 80028944 FUN_80028944 [[80028944, 800289b3]]

void FUN_80028944(void)

{
  if (DAT_8002aee4 == 0) {
    DAT_8002aee4 = 1;
    FUN_800219cc();
    FUN_800296ec(FUN_80028fec);
    DAT_8002ae7c = FUN_8002971c(0xf0000009,0x20,0x2000,0);
    FUN_8002972c();
    FUN_800267cc();
  }
  return;
}



// FUNCTION 800289bc FUN_800289bc [[800289bc, 80028aa7]]

undefined4 FUN_800289bc(undefined4 param_1,uint param_2)

{
  byte bVar1;
  
  *DAT_8002aef4 = 0;
  *DAT_8002aef8 = 0x80;
  *DAT_8002af00 = 0x21020843;
  *DAT_8002aefc = 0x1325;
  *DAT_8002af04 = *DAT_8002af04 | 0x8000;
  *DAT_8002af0c = param_1;
  *DAT_8002af10 = param_2 | 0x10000;
  bVar1 = *DAT_8002aef4;
  while ((bVar1 & 0x40) == 0) {
    bVar1 = *DAT_8002aef4;
  }
  *DAT_8002af08 = 0x11400100;
  return 0;
}



// FUNCTION 80028aac FUN_80028aac [[80028aac, 80028bab]]

undefined4 FUN_80028aac(undefined4 param_1,uint param_2)

{
  uint uVar1;
  
  *DAT_8002af14 = 0;
  *DAT_8002af18 = 0x80;
  *DAT_8002af20 = 0x20943;
  *DAT_8002af1c = 0x1323;
  *DAT_8002af24 = *DAT_8002af24 | 0x8000;
  *DAT_8002af2c = param_1;
  *DAT_8002af30 = param_2 | 0x10000;
  do {
  } while ((*DAT_8002af14 & 0x40) == 0);
  *DAT_8002af28 = 0x11000000;
  uVar1 = *DAT_8002af28;
  while ((uVar1 & 0x1000000) != 0) {
    uVar1 = *DAT_8002af28;
  }
  *DAT_8002af1c = 0x1325;
  return 0;
}



// FUNCTION 80028bac FUN_80028bac [[80028bac, 80028e2b]]

undefined4 FUN_80028bac(int param_1)

{
  uint uVar1;
  undefined2 *puVar2;
  int iVar3;
  undefined2 *puVar4;
  
  *DAT_8002af44 = *DAT_8002af44 | 0xb0000;
  puVar2 = DAT_8002af34;
  DAT_8002af50 = 0;
  DAT_8002af54 = 0;
  DAT_8002af4c = 0;
  DAT_8002af34[0xc0] = 0;
  puVar2[0xc1] = 0;
  puVar2[0xd5] = 0;
  FUN_80029684();
  puVar2 = DAT_8002af34;
  DAT_8002af34[0xc0] = 0;
  puVar2[0xc1] = 0;
  if ((puVar2[0xd7] & 0x7ff) != 0) {
    uVar1 = 1;
    do {
      if (0xf00 < uVar1) {
        FUN_800270dc(s_SPU_T_O___s__800207d8,s_wait__reset__800207e8);
        break;
      }
      uVar1 = uVar1 + 1;
    } while ((DAT_8002af34[0xd7] & 0x7ff) != 0);
  }
  puVar2 = DAT_8002af34;
  iVar3 = 0;
  puVar4 = (undefined2 *)&DAT_8002ee80;
  DAT_8002af58 = 2;
  DAT_8002af5c = 3;
  DAT_8002af60 = 8;
  DAT_8002af64 = 7;
  DAT_8002af34[0xd6] = 4;
  puVar2[0xc2] = 0;
  puVar2[0xc3] = 0;
  puVar2[0xc6] = 0xffff;
  puVar2[199] = 0xffff;
  puVar2[0xcc] = 0;
  puVar2[0xcd] = 0;
  do {
    *puVar4 = 0;
    puVar2 = DAT_8002af34;
    iVar3 = iVar3 + 1;
    puVar4 = puVar4 + 1;
  } while (iVar3 < 10);
  if (param_1 == 0) {
    DAT_8002af4c = 0x200;
    DAT_8002af34[200] = 0;
    puVar2[0xc9] = 0;
    puVar2[0xca] = 0;
    puVar2[0xcb] = 0;
    puVar2[0xd8] = 0;
    puVar2[0xd9] = 0;
    puVar2[0xda] = 0;
    puVar2[0xdb] = 0;
    FUN_80028e2c(&DAT_8002af74,0x10);
    iVar3 = 0;
    puVar2 = DAT_8002af34;
    do {
      *puVar2 = 0;
      puVar2[1] = 0;
      puVar2[2] = 0x3fff;
      puVar2[3] = 0x200;
      puVar2[4] = 0;
      puVar2[5] = 0;
      puVar4 = DAT_8002af34;
      iVar3 = iVar3 + 1;
      puVar2 = puVar2 + 8;
    } while (iVar3 < 0x18);
    DAT_8002af34[0xc4] = 0xffff;
    puVar4[0xc5] = 0xff;
    FUN_80029684();
    FUN_80029684();
    FUN_80029684();
    FUN_80029684();
    puVar2 = DAT_8002af34;
    DAT_8002af34[0xc6] = 0xffff;
    puVar2[199] = 0xff;
    FUN_80029684();
    FUN_80029684();
    FUN_80029684();
    FUN_80029684();
  }
  DAT_8002af68 = 1;
  DAT_8002af34[0xd5] = 0xc000;
  DAT_8002af6c = 0;
  DAT_8002af70 = 0;
  return 0;
}



// FUNCTION 80028e2c FUN_80028e2c [[80028e2c, 80028feb]]

void FUN_80028e2c(undefined2 *param_1,uint param_2)

{
  ushort *puVar1;
  undefined2 uVar2;
  int iVar3;
  int iVar4;
  uint uVar5;
  uint uVar6;
  ushort uVar7;
  
  puVar1 = (ushort *)(DAT_8002af34 + 0x1ae);
  *(undefined2 *)(DAT_8002af34 + 0x1a6) = DAT_8002af4c;
  uVar7 = *puVar1 & 0x7ff;
  FUN_80029684();
  iVar3 = DAT_8002af34;
  do {
    DAT_8002af34 = iVar3;
    if (param_2 == 0) {
      *(ushort *)(iVar3 + 0x1aa) = *(ushort *)(iVar3 + 0x1aa) & 0xffcf;
      if ((*(ushort *)(iVar3 + 0x1ae) & 0x7ff) != uVar7) {
        uVar6 = 1;
        do {
          if (0xf00 < uVar6) {
            FUN_800270dc(s_SPU_T_O___s__800207d8,s_wait__dmaf_clear_W__8002080c);
            return;
          }
          uVar6 = uVar6 + 1;
        } while ((*(ushort *)(DAT_8002af34 + 0x1ae) & 0x7ff) != uVar7);
      }
      return;
    }
    uVar6 = 0x40;
    if (param_2 < 0x41) {
      uVar6 = param_2;
    }
    iVar4 = 0;
    if (0 < (int)uVar6) {
      do {
        uVar2 = *param_1;
        param_1 = param_1 + 1;
        iVar4 = iVar4 + 2;
        *(undefined2 *)(iVar3 + 0x1a8) = uVar2;
      } while (iVar4 < (int)uVar6);
    }
    *(ushort *)(DAT_8002af34 + 0x1aa) = *(ushort *)(DAT_8002af34 + 0x1aa) & 0xffcf | 0x10;
    FUN_80029684();
    if ((*(ushort *)(DAT_8002af34 + 0x1ae) & 0x400) != 0) {
      uVar5 = 1;
      do {
        if (0xf00 < uVar5) {
          FUN_800270dc(s_SPU_T_O___s__800207d8,s_wait__wrdy_H__>_L__800207f8);
          break;
        }
        uVar5 = uVar5 + 1;
      } while ((*(ushort *)(DAT_8002af34 + 0x1ae) & 0x400) != 0);
    }
    param_2 = param_2 - uVar6;
    FUN_80029684();
    FUN_80029684();
    iVar3 = DAT_8002af34;
  } while( true );
}



// FUNCTION 80028fec FUN_80028fec [[80028fec, 800290a7]]

void FUN_80028fec(void)

{
  int iVar1;
  uint uVar2;
  
  if (DAT_8002af84 == 0) {
    FUN_80029684();
  }
  iVar1 = DAT_8002af34;
  *(ushort *)(DAT_8002af34 + 0x1aa) = *(ushort *)(DAT_8002af34 + 0x1aa) & 0xffcf;
  if ((*(ushort *)(iVar1 + 0x1aa) & 0x30) != 0) {
    uVar2 = 1;
    do {
      if (0xf00 < uVar2) break;
      uVar2 = uVar2 + 1;
    } while ((*(ushort *)(iVar1 + 0x1aa) & 0x30) != 0);
  }
  if (DAT_8002af6c == (code *)0x0) {
    FUN_8002882c(0xf0000009,0x20);
  }
  else {
    (*DAT_8002af6c)();
  }
  return;
}



// FUNCTION 800290a8 FUN_800290a8 [[800290a8, 8002914f]]

void FUN_800290a8(undefined4 param_1,undefined2 param_2,int param_3)

{
  *(undefined2 *)(DAT_8002af34 + 0x1a6) = param_2;
  FUN_80029684();
  *(ushort *)(DAT_8002af34 + 0x1aa) = *(ushort *)(DAT_8002af34 + 0x1aa) | 0x30;
  FUN_80029684();
  FUN_8002965c();
  *DAT_8002af38 = param_1;
  *DAT_8002af3c = param_3 << 0x10 | 0x10;
  DAT_8002af84 = 1;
  *DAT_8002af40 = 0x1000200;
  return;
}



// FUNCTION 80029150 FUN_80029150 [[80029150, 800293cf]]

undefined4 FUN_80029150(int param_1,uint param_2,uint param_3)

{
  ushort uVar1;
  uint uVar2;
  ushort uVar3;
  undefined4 uVar4;
  
  if (param_1 == 1) {
    DAT_8002af84 = 0;
    if (*(short *)(DAT_8002af34 + 0x1a6) != DAT_8002af4c) {
      uVar2 = 1;
      do {
        if (0xf00 < uVar2) {
          DAT_8002af84 = 0;
          return 0xfffffffe;
        }
        uVar2 = uVar2 + 1;
      } while (*(short *)(DAT_8002af34 + 0x1a6) != DAT_8002af4c);
    }
    *(ushort *)(DAT_8002af34 + 0x1aa) = *(ushort *)(DAT_8002af34 + 0x1aa) & 0xffcf | 0x20;
  }
  else if (param_1 < 2) {
    if (param_1 == 0) {
      DAT_8002af84 = 1;
      if (*(short *)(DAT_8002af34 + 0x1a6) != DAT_8002af4c) {
        uVar2 = 1;
        do {
          if (0xf00 < uVar2) {
            DAT_8002af84 = 1;
            return 0xfffffffe;
          }
          uVar2 = uVar2 + 1;
        } while (*(short *)(DAT_8002af34 + 0x1a6) != DAT_8002af4c);
      }
      *(ushort *)(DAT_8002af34 + 0x1aa) = *(ushort *)(DAT_8002af34 + 0x1aa) | 0x30;
    }
  }
  else if (param_1 == 2) {
    DAT_8002af4c = (short)(param_2 >> (DAT_8002af5c & 0x1f));
    *(short *)(DAT_8002af34 + 0x1a6) = DAT_8002af4c;
  }
  else if (param_1 == 3) {
    uVar3 = 0x20;
    if (DAT_8002af84 == 1) {
      uVar3 = 0x30;
    }
    uVar2 = 1;
    uVar1 = *(ushort *)(DAT_8002af34 + 0x1aa);
    while ((uVar1 & 0x30) != uVar3) {
      if (0xf00 < uVar2) {
        return 0xfffffffe;
      }
      uVar2 = uVar2 + 1;
      uVar1 = *(ushort *)(DAT_8002af34 + 0x1aa);
    }
    if (DAT_8002af84 == 1) {
      FUN_8002965c();
    }
    else {
      FUN_80029634();
    }
    DAT_8002af8c = (param_3 >> 6) + (uint)((param_3 & 0x3f) != 0);
    DAT_8002af88 = param_2;
    *DAT_8002af38 = param_2;
    *DAT_8002af3c = DAT_8002af8c << 0x10 | 0x10;
    uVar4 = 0x1000201;
    if (DAT_8002af84 == 1) {
      uVar4 = 0x1000200;
    }
    *DAT_8002af40 = uVar4;
  }
  return 0;
}



// FUNCTION 800293d0 FUN_800293d0 [[800293d0, 80029453]]

undefined4 FUN_800293d0(undefined4 param_1,undefined4 param_2)

{
  if (DAT_8002af50 == 0) {
    FUN_80029150(2,(uint)DAT_8002af4c << (DAT_8002af5c & 0x1f));
    FUN_80029150(1);
    FUN_80029150(3,param_1,param_2);
  }
  else {
    FUN_80028e2c(param_1,param_2);
  }
  return param_2;
}



// FUNCTION 80029454 FUN_80029454 [[80029454, 800294b7]]

undefined4 FUN_80029454(undefined4 param_1,undefined4 param_2)

{
  FUN_80029150(2,(uint)DAT_8002af4c << (DAT_8002af5c & 0x1f));
  FUN_80029150(0);
  FUN_80029150(3,param_1,param_2);
  return param_2;
}



// FUNCTION 800294b8 FUN_800294b8 [[800294b8, 800294fb]]

void FUN_800294b8(int param_1,uint param_2,int param_3)

{
  if (param_3 == 0) {
    *(short *)(param_1 * 2 + DAT_8002af34) = (short)param_2;
  }
  else {
    *(short *)(param_1 * 2 + DAT_8002af34) = (short)(param_2 >> (DAT_8002af5c & 0x1f));
  }
  return;
}



// FUNCTION 80029634 FUN_80029634 [[80029634, 8002965b]]

void FUN_80029634(void)

{
  *DAT_8002af48 = *DAT_8002af48 & 0xf0ffffff | 0x20000000;
  return;
}



// FUNCTION 8002965c FUN_8002965c [[8002965c, 80029683]]

void FUN_8002965c(void)

{
  *DAT_8002af48 = *DAT_8002af48 & 0xf0ffffff | 0x22000000;
  return;
}



// FUNCTION 80029684 FUN_80029684 [[80029684, 800296df]]

void FUN_80029684(void)

{
  undefined4 local_8;
  
  for (local_8 = 0; local_8 < 0x3c; local_8 = local_8 + 1) {
  }
  return;
}



// FUNCTION 800296ec FUN_800296ec [[800296ec, 8002970f]]

void FUN_800296ec(undefined4 param_1)

{
  FUN_80021a3c(4,param_1);
  return;
}



// FUNCTION 8002971c FUN_8002971c [[8002971c, 80029727]]

void FUN_8002971c(void)

{
  (*(code *)&LAB_000000b0)();
  return;
}



// FUNCTION 8002972c FUN_8002972c [[8002972c, 80029737]]

void FUN_8002972c(void)

{
  (*(code *)&LAB_000000b0)();
  return;
}


