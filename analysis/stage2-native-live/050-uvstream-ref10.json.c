
/* WARNING: Globals starting with '_' overlap smaller symbols at the same address */

void FUN_00485390(int param_1,uint *param_2,int param_3)

{
  char cVar1;
  uint *puVar2;
  int iVar3;
  char extraout_CL;
  char *pcVar4;
  uint uVar5;
  char *pcVar6;
  char local_88 [128];
  uint local_8;
  
  local_8 = DAT_005122ac ^ (uint)&stack0xfffffffc;
  if (param_2 == (uint *)0x0) {
    if ((param_3 == 0) || (*(int *)(param_3 + 0x44) != -4)) {
      iVar3 = DAT_00791700 * 0xc;
      uVar5 = DAT_00791700 + 1;
      DAT_00791700 = -(uint)(uVar5 < 0x18) & uVar5;
      *(undefined4 *)(&DAT_00791760 + iVar3) = *(undefined4 *)(param_1 + 0x2c);
      *(undefined4 *)(&DAT_00791764 + iVar3) = *(undefined4 *)(param_1 + 0x30);
      *(undefined4 *)(&DAT_00791768 + iVar3) = *(undefined4 *)(param_1 + 0x34);
      FUN_00480150(0,(int)DAT_00518026,(int)DAT_00518028,DAT_00518024,uVar5,0,0);
      FUN_0042b4e0(1,DAT_00791740,8);
      FUN_0042b9d0();
      FUN_0042b4e0(1,DAT_00791738,1);
      DAT_00799100 = *(undefined4 *)(param_1 + 0x2c);
      DAT_00799104 = *(undefined4 *)(param_1 + 0x30);
      DAT_00799108 = *(undefined4 *)(param_1 + 0x34);
      DAT_00799110 = 1;
      DAT_0079910c = (uint)(PTR_DAT_00513210[0x2c1] == '\x01') * 8 + 8;
      FUN_0042bad0();
      if (DAT_006b1400 == 0) {
        _DAT_0079172c = *(undefined4 *)(param_1 + 0x2c);
        _DAT_00791730 = *(undefined4 *)(param_1 + 0x30);
        _DAT_00791734 = *(undefined4 *)(param_1 + 0x34);
        _DAT_00791720 = 1;
        DAT_00791724 = 0x1f;
        _DAT_00791728 = 1;
      }
      FUN_0042d150();
      DAT_00626a80._0_2_ = *(undefined2 *)(param_1 + 0x2e);
      DAT_00626a80._2_2_ = *(undefined2 *)(param_1 + 0x32);
      DAT_00626a84._0_2_ = *(undefined2 *)(param_1 + 0x36);
      DAT_00626a8c = 1;
      FUN_0042b4e0(1,DAT_007990c0,0x4000);
      FUN_00485a10();
    }
  }
  else if ((param_2 != *(uint **)(param_1 + 0x1a0)) && (param_2 != *(uint **)(param_1 + 0x1a4))) {
    if (((((PTR_DAT_00513210[0x280] == '\x03') || (PTR_DAT_00513210[0x280] == '\x0f')) &&
         ((*param_2 & 0x1ff) == 3)) &&
        ((((int *)param_2[0x1b0] == (int *)0xffffffff || (*(int *)param_2[0x1b0] != 1)) &&
         (FUN_004991a0(), (DAT_00696068 & 2) != 0)))) &&
       ((iVar3 = FUN_004ad140(), iVar3 == 1 && (extraout_CL < '\0')))) {
      FUN_004add70(PTR_DAT_00513210 + 0xe0);
    }
    *(undefined4 *)(param_1 + 0x1a4) = *(undefined4 *)(param_1 + 0x1a0);
    *(uint **)(param_1 + 0x1a0) = param_2;
    *(undefined2 *)(param_1 + 0x1ba) = 0;
    FUN_0048bc50();
    puVar2 = *(uint **)(param_1 + 0x164);
    if (puVar2 != param_2) {
      *puVar2 = *puVar2 | 0x20000;
    }
    if ((((*param_2 & 0x1ff) == 3) && (*(int *)(param_1 + 0x164) != 0)) &&
       ((char)param_2[0x1c8] != '\b')) {
      if ((((DAT_00696068 & 2) != 0) && ((DAT_00696068 & 4) != 0)) && ((char)DAT_00696068 < '\0')) {
        DAT_005131f4 = DAT_005131f4 * 0x41a7 & 0x7fffffff;
        if ((((uint)(byte)PTR_DAT_00513210[0x27c] <= (uint)*(ushort *)((int)param_2 + 0x66e)) ||
            (pcVar6 = (char *)(&DAT_0066b338 + (uint)*(ushort *)((int)param_2 + 0x66e) * 0xda),
            pcVar6 == (char *)0x0)) || (*pcVar6 == '\0')) {
          pcVar6 = &DAT_0051941c;
        }
        pcVar4 = pcVar6;
        do {
          cVar1 = *pcVar4;
          pcVar4[(int)(local_88 + -(int)pcVar6)] = cVar1;
          pcVar4 = pcVar4 + 1;
        } while (cVar1 != '\0');
        FUN_004ae060(pcVar6,local_88,pcVar4);
        pcVar6 = local_88;
        do {
          cVar1 = *pcVar6;
          pcVar6 = pcVar6 + 1;
        } while (cVar1 != '\0');
        if (pcVar6 != local_88 + 1) {
          FUN_004b6050();
          __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
          return;
        }
      }
    }
  }
  __security_check_cookie(local_8 ^ (uint)&stack0xfffffffc);
  return;
}

