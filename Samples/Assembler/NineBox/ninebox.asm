; NINE BOX: fill 3 x 3 cells, and the box goes.
; SC62015 machine code; no BASIC program. LOAD M entry BD000h.
; The field: 9 lanes x 18 depth, 3-dot square cells; blocks fall to the RIGHT.
; Blocks have one to three cells (dot, pair, diagonal, bar, corner).
; Internal scratch 20h..EFh and caller registers are saved/restored.
        ORG $BD000              ; in the machine-code area: up to BFBFF
mode EQU $20                ; 0 title, 1 play, 2 pause, 3 game over
quit_flag EQU $21
key_now EQU $22
key_prev EQU $23
key_latch EQU $24
event EQU $25
key_edge EQU $26
fall_count EQU $27
drop_ticks EQU $28
repeat_count EQU $29
rng EQU $2A
piece EQU $2B
next_piece EQU $2C
piece_rot EQU $2D
piece_x EQU $2E
piece_y EQU $2F
collision_flag EQU $30
block_count EQU $31
cell_x EQU $32
cell_y EQU $33
row_work EQU $34
shift_rows EQU $35
temp EQU $36
draw_x EQU $37
draw_y EQU $38
pixel_mask EQU $39
pixel_col EQU $3A
glyph_col EQU $3B
glyph_row EQU $3C
glyph_bits EQU $3D
text_x EQU $3E
text_y EQU $3F
lcd_page EQU $40
lcd_cols EQU $41
chain EQU $42               ; boxes of one drop, so far
boxes_mod EQU $43
level EQU $44
repeat_key EQU $45
dirty EQU $46
tick_pending EQU $47
kick_x EQU $48
kick_rot EQU $49
mask_low EQU $4A
mask_high EQU $4B
board_row EQU $4C
board_col EQU $4D
number_count EQU $4E
digit_ptr EQU $4F
bag_used EQU $50
candidate EQU $51
candidate_bit EQU $52
box_col EQU $53              ; the lane of the box looked at
score_digits EQU $60         ; six digits, units first
box_digits EQU $66           ; three digits, units first
level_digits EQU $69         ; two digits, units first
UPKEY EQU 1
DOWNKEY EQU 2
CWKEY EQU 4
SOFTKEY EQU 8
DROPKEY EQU 16
PAUSEKEY EQU 32
CCWKEY EQU 64

start:
        PUSHU BA
        PUSHU I
        PUSHU X
        PUSHU Y
        PUSHU IMR
        MV ($FB),0
        MV I,208
        MVL [saved_scratch],($20)
        MV A,($FD)
        MV [saved_scr],A
        AND ($FD),$8F        ; silence ROM key-click/XOUT immediately
        MV I,144
        MVL ($20),[zeroes]
        MV (rng),$A7
        MV A,$3F
        CALL lcd_both
        MV A,$C0
        CALL lcd_both
        CALL poll_io
        MV (key_latch),0     ; CALL's held ENTER must not skip the title
        CALL render
        AND ($FC),$FE
        MV (tick_pending),0

main_loop:
        CALL poll_io
        TEST (quit_flag),1
        JPNZ exit_game
        CMP (tick_pending),0
        JRZ main_render
        DEC (tick_pending)
        MV (event),(key_latch)
        MV (key_latch),0
        CALL tick_game
        JP main_loop
main_render:
        CMP (dirty),0
        JRZ main_loop
        MV (dirty),0
        CALL render
        JP main_loop

tick_game:
        CALL random_step
        CMP (mode),0
        JRZ title_tick
        CMP (mode),3
        JRZ title_tick
        TEST (event),PAUSEKEY
        JRZ no_pause_event
        MV A,(mode)
        XOR A,3              ; play 1 <-> pause 2
        MV (mode),A
        MV (dirty),1
        RET
no_pause_event:
        CMP (mode),2
        JRZ tick_done
        CALL handle_input
        CMP (mode),1
        JRNZ tick_done
        INC (fall_count)
        MV A,(drop_ticks)
        CMP (fall_count),A
        JRC tick_done
        MV (fall_count),0
        CALL fall_once
tick_done:
        RET
title_tick:
        TEST (event),DROPKEY
        JRZ tick_done
        CALL new_game
        RET

exit_game:
        ; Wait for ON/BRK release before re-enabling the ROM interrupt handler.
        MV ($F0),0
        AND ($F1),$F0
        OR ($F1),8
exit_release:
        MV A,($F2)
        TEST A,2
        JRNZ exit_release
        MV ($F0),0
        AND ($F1),$F0
        MV I,208
        MVL ($20),[saved_scratch]
        ; IOCS may modify scratch: preserve it again after clearing the LCD.
        MV A,($D6)
        PUSHU A
        MV A,($D7)
        PUSHU A
        MV ($D6),0
        MV ($D7),0
        MV IL,$51
        CALLF $FFFE8
        POPU A
        MV ($D7),A
        POPU A
        MV ($D6),A
        MV I,208
        MVL ($20),[saved_scratch]
        MV A,[saved_scr]
        AND A,$8F            ; do not resurrect a stale tone on exit
        MV ($FD),A
        AND ($FC),$F2
        POPU IMR
        POPU Y
        POPU X
        POPU I
        POPU BA
        RETF                ; BASIC CALL pushes a FAR return address

new_game:
        MV X,board
        MV I,162
        MV A,0
ng_clear:
        MV [X++],A
        DEC I
        JRNZ ng_clear
        MV I,11
        MVL (score_digits),[zeroes]
        MV (mode),1
        MV (fall_count),0
        MV (drop_ticks),40   ; 0.625 seconds/cell at level 1 (64 Hz)
        MV (level),1
        MV (level_digits),1
        MV (boxes_mod),0
        MV (bag_used),0
        MV (repeat_key),0
        MV (repeat_count),0
        CALL pick_next
        CALL spawn_piece
        MV (dirty),1
        RET

random_step:
        MV A,(rng)
        RC
        SHR A
        JRNC rand_store
        XOR A,$B8
rand_store:
        MV (rng),A
        RET

; A bag of the five pieces. Reject already-used pieces; seed advances on title ticks.
pick_next:
        CMP (bag_used),$1F
        JRNZ pick_try
        MV (bag_used),0
pick_try:
        CALL random_step
        MV A,(rng)
pick_mod:
        CMP A,5
        JRC pick_candidate
        SUB A,5
        JR pick_mod
pick_candidate:
        MV (candidate),A
        MV X,bit_masks
        ADD X,A
        MV A,[X]
        MV (candidate_bit),A
        TEST (bag_used),A
        JRNZ pick_try
        OR (bag_used),A
        MV (next_piece),(candidate)
        RET

spawn_piece:
        MV (piece),(next_piece)
        CALL pick_next
        MV (piece_rot),0
        MV (piece_x),3
        MV (piece_y),0
        MV (fall_count),0
        CALL collision
        CMP (collision_flag),0
        JRZ spawn_ok
        MV (mode),3
spawn_ok:
        MV (dirty),1
        RET

handle_input:
        ; UP/DOWN follow the screen lanes. Z/X or LEFT rotate, RIGHT advances.
        MV A,(key_now)
        AND A,3
        CMP (repeat_key),A
        JRZ repeat_same
        MV (repeat_key),A
        MV (repeat_count),16
        JR movement_events
repeat_same:
        CMP A,0
        JRZ movement_events
        DEC (repeat_count)
        JRNZ movement_events
        OR (event),A
        MV (repeat_count),4
movement_events:
        TEST (event),UPKEY
        JRZ input_down
        CALL move_left
input_down:
        TEST (event),DOWNKEY
        JRZ input_cw
        CALL move_right
input_cw:
        TEST (event),CWKEY
        JRZ input_ccw
        MV (temp),3          ; transposed board: -1 is clockwise on screen
        CALL rotate_piece
input_ccw:
        TEST (event),CCWKEY
        JRZ input_drop
        MV (temp),1
        CALL rotate_piece
input_drop:
        TEST (event),DROPKEY
        JRZ input_soft
hard_drop:
        INC (piece_y)
        CALL collision
        CMP (collision_flag),0
        JRNZ hard_hit
        MV I,1
        CALL add_points
        JR hard_drop
hard_hit:
        DEC (piece_y)
        CALL lock_piece
        RET
input_soft:
        TEST (key_now),SOFTKEY
        JRZ input_done
        CALL fall_once
input_done:
        RET

move_left:
        DEC (piece_x)
        CALL collision
        CMP (collision_flag),0
        JRZ move_changed
        INC (piece_x)
        RET
move_right:
        INC (piece_x)
        CALL collision
        CMP (collision_flag),0
        JRZ move_changed
        DEC (piece_x)
        RET
move_changed:
        MV (dirty),1
        RET

rotate_piece:
        MV (kick_x),(piece_x)
        MV (kick_rot),(piece_rot)
        MV A,(piece_rot)
        ADD A,(temp)
        AND A,3
        MV (piece_rot),A
        CALL collision
        CMP (collision_flag),0
        JRZ move_changed
        DEC (piece_x)          ; simple one-cell wall kicks
        CALL collision
        CMP (collision_flag),0
        JRZ move_changed
        ADD (piece_x),2
        CALL collision
        CMP (collision_flag),0
        JRZ move_changed
        MV (piece_x),(kick_x)
        MV (piece_rot),(kick_rot)
        RET

fall_once:
        INC (piece_y)
        CALL collision
        CMP (collision_flag),0
        JRZ move_changed
        DEC (piece_y)
        CALL lock_piece
        RET

shape_pointer:
        MV X,shapes
        MV A,(piece)
        MV IL,24
shape_type:
        CMP A,0
        JRZ shape_rot
        ADD X,IL
        DEC A
        JR shape_type
shape_rot:
        MV A,(piece_rot)
        MV IL,6
shape_rotation:
        CMP A,0
        JRZ shape_done
        ADD X,IL
        DEC A
        JR shape_rotation
shape_done:
        RET

board_pointer:
        MV Y,board
        MV A,(cell_y)
        MV IL,9
bp_row:
        CMP A,0
        JRZ bp_col
        ADD Y,IL
        DEC A
        JR bp_row
bp_col:
        MV A,(cell_x)
        ADD Y,A
        RET

collision:
        MV (collision_flag),0
        CALL shape_pointer
        MV (block_count),3
col_block:
        MV A,[X++]
        ADD A,(piece_x)
        MV (cell_x),A
        CMP A,9
        JRNC col_bad
        MV A,[X++]
        ADD A,(piece_y)
        MV (cell_y),A
        CMP A,18
        JRNC col_bad
        CALL board_pointer
        MV A,[Y]
        CMP A,0
        JRNZ col_bad
        DEC (block_count)
        JRNZ col_block
        RET
col_bad:
        MV (collision_flag),1
        RET

lock_piece:
        CALL shape_pointer
        MV (block_count),3
lock_block:
        MV A,[X++]
        ADD A,(piece_x)
        MV (cell_x),A
        MV A,[X++]
        ADD A,(piece_y)
        MV (cell_y),A
        CALL board_pointer
        MV A,(piece)
        INC A
        MV [Y],A
        DEC (block_count)
        JRNZ lock_block
        CALL clear_boxes
        CALL spawn_piece
        RET

; Look for a full 3 x 3 box, the deepest first; take it out, and look again.
clear_boxes:
        MV (chain),0
cb_again:
        MV (row_work),15     ; the box is at depth 15..17 to begin with
cb_row:
        MV (box_col),0
cb_col:
        MV (cell_y),(row_work)
        MV (cell_x),(box_col)
        CALL board_pointer
        MV (shift_rows),3
cb_line:
        MV (block_count),3
cb_cell:
        MV A,[Y++]
        CMP A,0
        JRZ cb_next
        DEC (block_count)
        JRNZ cb_cell
        MV A,6               ; the same lane, one deeper
        ADD Y,A
        DEC (shift_rows)
        JRNZ cb_line
        INC (chain)
        CALL remove_box
        CALL count_box
        MV (block_count),(chain)
cb_award:
        MV I,90              ; 90 for the first box of a drop, 180 for the second, ...
        CALL add_points
        DEC (block_count)
        JRNZ cb_award
        JP cb_again
cb_next:
        INC (box_col)
        CMP (box_col),7
        JRC cb_col
        CMP (row_work),0
        JRZ cb_done
        DEC (row_work)
        JP cb_row
cb_done:
        RET

; Take out the box at (box_col, row_work): in its three lanes, what is before it
; goes three cells deeper. The other lanes stay as they are.
remove_box:
        MV A,(row_work)
        ADD A,2
        MV (shift_rows),A
        MV (cell_y),A
        MV (cell_x),(box_col)
        CALL board_pointer
        MV X,Y
rm_row:
        CMP (shift_rows),3
        JRC rm_empty
        MV Y,X
        MV A,27              ; three depths before
        SUB Y,A
        MV (block_count),3
rm_cell:
        MV A,[Y++]
        MV [X++],A
        DEC (block_count)
        JRNZ rm_cell
        MV A,12              ; three lanes back, one depth before
        SUB X,A
        DEC (shift_rows)
        JR rm_row
rm_empty:                    ; depth 2, 1 and 0
        MV (shift_rows),3
rm_empty_row:
        MV A,0
        MV [X++],A
        MV [X++],A
        MV [X++],A
        MV A,12
        SUB X,A
        DEC (shift_rows)
        JRNZ rm_empty_row
        RET

count_box:
        MV ($ED),box_digits
box_carry:
        INC (PX)
        CMP (PX),10
        JRC box_done
        MV (PX),0
        INC ($ED)
        CMP ($ED),box_digits+3
        JRC box_carry
        MV (box_digits),9
        MV (box_digits+1),9
        MV (box_digits+2),9
box_done:
        INC (boxes_mod)
        CMP (boxes_mod),10
        JRC level_done
        MV (boxes_mod),0
        CMP (level),9
        JRNC level_done
        INC (level)
        MV (level_digits),(level)
        SUB (drop_ticks),4
level_done:
        RET

; Add I points to six decimal digits. Saturate at 999999, never wrap.
add_points:
points_unit:
        MV ($ED),score_digits
points_carry:
        INC (PX)
        CMP (PX),10
        JRC points_next
        MV (PX),0
        INC ($ED)
        CMP ($ED),score_digits+6
        JRC points_carry
        MV I,6
        MVL (score_digits),[nines]
        RET
points_next:
        DEC I
        JRNZ points_unit
        MV (dirty),1
        RET

; Polling is independent of redraw. Pending timer ticks are drained before the
; next frame; rendering never changes the choice of pieces or game coordinates.
poll_io:
        PUSHU A
        TEST ($FC),1
        JRZ poll_keys
        AND ($FC),$FE
        CMP (tick_pending),255
        JRZ poll_keys
        INC (tick_pending)
poll_keys:
        MV (key_now),0
        AND ($F1),$F0
        MV ($F0),8
        NOP
        MV A,($F2)
        TEST A,$40
        JRZ key_left
        OR (key_now),UPKEY
key_left:
        TEST A,$80
        JRZ key_row2
        OR (key_now),CWKEY
key_row2:
        MV ($F0),4
        NOP
        MV A,($F2)
        TEST A,$80
        JRZ key_space
        OR (key_now),DOWNKEY
key_space:
        TEST A,$40
        JRZ key_row4
        OR (key_now),DROPKEY
key_row4:
        MV ($F0),16
        NOP
        MV A,($F2)
        TEST A,$40
        JRZ key_enter
        OR (key_now),SOFTKEY
key_enter:
        TEST A,$80
        JRZ key_row0
        OR (key_now),DROPKEY
key_row0:
        MV ($F0),1
        NOP
        MV A,($F2)
        TEST A,$20
        JRZ key_row1
        OR (key_now),CCWKEY
key_row1:
        MV ($F0),2
        NOP
        MV A,($F2)
        TEST A,$10
        JRZ key_row10
        OR (key_now),CWKEY
key_row10:
        MV ($F0),0
        AND ($F1),$F0
        OR ($F1),4
        NOP
        MV A,($F2)
        TEST A,1
        JRZ key_quit
        OR (key_now),PAUSEKEY
key_quit:
        AND ($F1),$F0
        OR ($F1),8
        NOP
        MV A,($F2)
        TEST A,2
        JRZ key_finish
        MV (quit_flag),1
key_finish:
        MV ($F0),0
        AND ($F1),$F0
        MV A,(key_prev)
        XOR A,255
        AND A,(key_now)
        OR (key_latch),A
        MV (key_prev),(key_now)
        POPU A
        RET

; --------------------------------------------------------------------------
; Renderer. Static screens are prevalidated 1-bit assets embedded below.
; Tile locations are precomputed 8-byte records so no line counters/coordinate
; scratch can spill from one panel into another.
render:
        MV X,title_bitmap
        CMP (mode),0
        JRZ render_background
        MV X,game_bitmap
        CMP (mode),1
        JRZ render_background
        MV X,pause_bitmap
        CMP (mode),2
        JRZ render_background
        MV X,over_bitmap
render_background:
        MV Y,framebuffer0
        MV I,1024
copy_screen:
        MV A,[X++]
        MV [Y++],A
        DEC I
        JRNZ copy_screen
        CALL poll_io
        CMP (mode),0
        JPZ flush_lcd
        CALL draw_board
        CMP (mode),3
        JRZ render_numbers
        CALL draw_active
render_numbers:
        CALL draw_preview
        MV (text_x),26
        MV (text_y),11
        MV (digit_ptr),score_digits+5
        MV (number_count),6
        CALL draw_number
        CALL poll_io
        MV (text_x),26
        MV (text_y),18
        MV (digit_ptr),box_digits+2
        MV (number_count),3
        CALL draw_number
        MV (text_x),26
        MV (text_y),25
        MV (digit_ptr),level_digits+1
        MV (number_count),2
        CALL draw_number
        JP flush_lcd

draw_board:
        MV Y,board
        MV X,board_tiles
        MV (board_row),18
board_draw_row:
        MV (board_col),9
board_draw_cell:
        MV A,[Y++]
        CMP A,0
        JRZ board_empty
        CALL draw_tile
board_empty:
        MV IL,8
        ADD X,IL
        DEC (board_col)
        JRNZ board_draw_cell
        CALL poll_io
        DEC (board_row)
        JRNZ board_draw_row
        RET

cell_tile_pointer:
        MV X,board_tiles
        MV A,(cell_y)
        MV IL,72
tile_row:
        CMP A,0
        JRZ tile_col
        ADD X,IL
        DEC A
        JR tile_row
tile_col:
        MV A,(cell_x)
        ADD A,A
        ADD A,A
        ADD A,A
        ADD X,A
        RET

draw_active:
        CALL shape_pointer
        MV (block_count),3
active_block:
        MV A,[X++]
        ADD A,(piece_x)
        MV (cell_x),A
        MV A,[X++]
        ADD A,(piece_y)
        MV (cell_y),A
        PUSHU X
        CALL cell_tile_pointer
        CALL draw_tile
        POPU X
        DEC (block_count)
        JRNZ active_block
        RET

draw_preview:
        ; Preview is read directly from the next shape; it never swaps state.
        MV X,shapes
        MV A,(next_piece)
        MV IL,24
preview_seek:
        CMP A,0
        JRZ preview_start
        ADD X,IL
        DEC A
        JR preview_seek
preview_start:
        MV (block_count),3
preview_block:
        MV A,[X++]
        MV (cell_x),A
        MV A,[X++]
        MV (cell_y),A
        PUSHU X
        MV X,preview_tiles
        MV A,(cell_y)
        ADD A,A
        ADD A,A
        ADD A,(cell_x)
        ADD A,A
        ADD A,A
        ADD A,A
        ADD X,A
        CALL draw_tile
        POPU X
        DEC (block_count)
        JRNZ preview_block
        RET

; X = tile record: offset column0:u16, column1:u16, maskLow, maskHigh, pad2.
; Preserves X,Y,I,BA so callers can keep board and shape pointers in registers.
draw_tile:
        PUSHU BA
        PUSHU X
        PUSHU Y
        MV A,[X+4]
        MV (mask_low),A
        MV A,[X+5]
        MV (mask_high),A
        MV BA,[X++]
        MV Y,framebuffer0
        ADD Y,BA
        CALL tile_column
        MV BA,[X]
        MV Y,framebuffer0
        ADD Y,BA
        CALL tile_column
        POPU Y
        POPU X
        POPU BA
        RET
tile_column:
        MV A,[Y]
        OR A,(mask_low)
        MV [Y],A
        CMP (mask_high),0
        JRZ tile_column_done
        MV A,[Y+64]
        OR A,(mask_high)
        MV [Y+64],A
tile_column_done:
        RET

draw_number:
        MV A,(digit_ptr)
        MV ($ED),A
        MV A,(PX)
        CALL draw_digit
        DEC (digit_ptr)
        DEC (number_count)
        JRNZ draw_number
        RET
draw_digit:
        MV X,digit_font
        MV IL,3
digit_seek:
        CMP A,0
        JRZ digit_start
        ADD X,IL
        DEC A
        JR digit_seek
digit_start:
        MV (glyph_col),0
digit_column:
        MV A,[X++]
        MV (glyph_bits),A
        MV (glyph_row),0
digit_row:
        TEST (glyph_bits),1
        JRZ digit_skip
        MV A,(text_x)
        ADD A,(glyph_col)
        MV (draw_x),A
        MV A,(text_y)
        ADD A,(glyph_row)
        MV (draw_y),A
        PUSHU X
        CALL set_pixel
        POPU X
digit_skip:
        RC
        SHR (glyph_bits)
        INC (glyph_row)
        CMP (glyph_row),5
        JRC digit_row
        INC (glyph_col)
        CMP (glyph_col),3
        JRC digit_column
        ADD (text_x),4
        RET

; Clipped pixel routine, used only for decimal digits. No caller coordinates
; are advanced here. Masks/offsets use SC62015's through-carry shifts correctly.
set_pixel:
        MV A,(draw_x)
        CMP A,240
        JRNC pixel_done
        MV A,(draw_y)
        CMP A,32
        JRNC pixel_done
        AND A,7
        MV Y,bit_masks
        ADD Y,A
        MV A,[Y]
        MV (pixel_mask),A
        MV A,(draw_x)
        CMP A,64
        JRC pixel_left
        CMP A,120
        JRC pixel_midleft
        CMP A,176
        JRC pixel_midright
        MV X,framebuffer1+256
        MV A,239
        SUB A,(draw_x)
        JR pixel_column
pixel_midright:
        MV X,framebuffer0+256
        MV A,175
        SUB A,(draw_x)
        JR pixel_column
pixel_midleft:
        MV X,framebuffer0
        MV A,(draw_x)
        SUB A,64
        JR pixel_column
pixel_left:
        MV X,framebuffer1
        MV A,(draw_x)
pixel_column:
        MV (pixel_col),A
        MV A,(draw_y)
        RC
        SHR A
        RC
        SHR A
        RC
        SHR A
        MV IL,64
pixel_page:
        CMP A,0
        JRZ pixel_write
        ADD X,IL
        DEC A
        JR pixel_page
pixel_write:
        MV A,(pixel_col)
        ADD X,A
        MV A,[X]
        OR A,(pixel_mask)
        MV [X],A
pixel_done:
        RET

; Poll real hardware BUSY before each LCD transfer (the emulator omits BUSY).
; Commands/data go to one controller at a time. Poll keyboard/timer per page.
lcd_both:
        PUSHU A
both_wait:
        MV A,[$2005]
        TEST A,$80
        JRNZ both_wait
        MV A,[$2009]
        TEST A,$80
        JRNZ both_wait
        POPU A
        MV [$2000],A
        RET

flush_lcd:
        MV X,framebuffer0
        MV (lcd_page),0
flush0_page:
flush0_wait_cmd:
        MV A,[$2009]
        TEST A,$80
        JRNZ flush0_wait_cmd
        MV A,(lcd_page)
        ADD A,$B8
        MV [$2008],A
flush0_wait_col:
        MV A,[$2009]
        TEST A,$80
        JRNZ flush0_wait_col
        MV A,$40
        MV [$2008],A
        MV (lcd_cols),64
flush0_byte:
        MV A,[$2009]
        TEST A,$80
        JRNZ flush0_byte
        MV A,[X++]
        MV [$200A],A
        DEC (lcd_cols)
        JRNZ flush0_byte
        CALL poll_io
        INC (lcd_page)
        CMP (lcd_page),8
        JRC flush0_page
        MV (lcd_page),0
flush1_page:
flush1_wait_cmd:
        MV A,[$2005]
        TEST A,$80
        JRNZ flush1_wait_cmd
        MV A,(lcd_page)
        ADD A,$B8
        MV [$2004],A
flush1_wait_col:
        MV A,[$2005]
        TEST A,$80
        JRNZ flush1_wait_col
        MV A,$40
        MV [$2004],A
        MV (lcd_cols),64
flush1_byte:
        MV A,[$2005]
        TEST A,$80
        JRNZ flush1_byte
        MV A,[X++]
        MV [$2006],A
        DEC (lcd_cols)
        JRNZ flush1_byte
        CALL poll_io
        INC (lcd_page)
        CMP (lcd_page),8
        JRC flush1_page
frame_ready:                   ; captures stop HERE, after a complete LCD frame
        RET

shapes:                         ; lane,depth of three cells, for each of four turns
        ; dot (the same cell three times)
        DB 1,0, 1,0, 1,0,   1,0, 1,0, 1,0,   1,0, 1,0, 1,0,   1,0, 1,0, 1,0
        ; pair (the third cell is the second again)
        DB 1,0, 1,1, 1,1,   2,1, 1,1, 1,1,   1,2, 1,1, 1,1,   0,1, 1,1, 1,1
        ; diagonal
        DB 0,0, 1,1, 1,1,   1,0, 0,1, 0,1,   0,0, 1,1, 1,1,   1,0, 0,1, 0,1
        ; bar
        DB 0,1, 1,1, 2,1,   1,0, 1,1, 1,2,   0,1, 1,1, 2,1,   1,0, 1,1, 1,2
        ; corner
        DB 0,0, 1,0, 0,1,   0,0, 1,0, 1,1,   1,0, 0,1, 1,1,   0,0, 0,1, 1,1

bit_masks: DB 1,2,4,8,16,32,64,128
digit_font:                     ; three columns a digit, bit 0 at the top
        DB 0b11111,0b10001,0b11111   ; 0
        DB 0b10010,0b11111,0b10000   ; 1
        DB 0b11001,0b10101,0b10010   ; 2
        DB 0b10001,0b10101,0b01010   ; 3
        DB 0b00111,0b00100,0b11111   ; 4
        DB 0b10111,0b10101,0b01001   ; 5
        DB 0b11110,0b10101,0b11101   ; 6
        DB 0b00001,0b11101,0b00011   ; 7
        DB 0b11111,0b10101,0b11111   ; 8
        DB 0b10111,0b10101,0b01111   ; 9
title_bitmap: INCBIN "assets/title.lcd"
game_bitmap: INCBIN "assets/game.lcd"
pause_bitmap: INCBIN "assets/paused.lcd"
over_bitmap: INCBIN "assets/over.lcd"
        INCLUDE "tiles.inc"
zeroes: DS 144,0
nines: DB 9,9,9,9,9,9
code_end:
saved_scr: DB 0
saved_scratch: DS 208,0
board: DS 162,0
framebuffer0: DS 512,0
framebuffer1: DS 512,0
image_end:
        END
