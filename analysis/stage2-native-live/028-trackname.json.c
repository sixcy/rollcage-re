
char * FUN_00471610(void)

{
  undefined1 uVar1;
  uint uVar2;
  uint *in_ECX;
  uint *in_EDX;
  
  uVar1 = DAT_006c1061;
  *in_EDX = 0;
  switch(uVar1) {
  case 0:
  case 0xf:
    *in_ECX = (uint)DAT_006c106a + (uint)DAT_006c1062 * 4;
    return s_LEAGUE_TRACK_ORDER_00517528;
  case 1:
    *in_ECX = 0x39;
    break;
  case 2:
    *in_ECX = 0x38;
    break;
  case 3:
    *in_ECX = 0x37;
    return s_DEATHMATCH_00517554;
  case 4:
    *in_ECX = (uint)(byte)PTR_DAT_00513210[0x2ac];
    break;
  default:
    return (char *)0x0;
  case 6:
    *in_ECX = DAT_006c106a + 0x14;
    return s_SCRAMBLE_0051753c;
  case 7:
    uVar2 = (uint)DAT_006c1060;
    *in_ECX = 0x3a;
    *in_EDX = uVar2;
    return s_DEMOLITION_00517574;
  case 8:
    *in_ECX = 0x3c;
    return (char *)0x0;
  case 9:
    uVar2 = (uint)DAT_006c1060;
    *in_ECX = 0x3b;
    *in_EDX = uVar2;
    return s_PURSUIT_TRACKS_00517580;
  case 10:
    *in_ECX = 0x3e;
    return s_LEAGUE_TRACK_ORDER_00517560;
  case 0xb:
    *in_ECX = 0x3d;
    return s_LEAGUE_TRACK_ORDER_00517560;
  case 0xc:
    *in_ECX = 0x38;
    return s_LEAGUE_TRACK_ORDER_00517560;
  case 0xd:
    *in_ECX = 0x3f;
    return s_LEAGUE_TRACK_ORDER_00517528;
  case 0xe:
    *in_ECX = DAT_006c106a + 0x2d;
    return s_TRAINING_00517548;
  }
  *in_EDX = (uint)DAT_006c1060;
  return (&PTR_s_HARPOON_004f2998)[DAT_006c1063];
}

