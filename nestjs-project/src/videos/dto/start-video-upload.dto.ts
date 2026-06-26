import {
  IsInt,
  IsMimeType,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class StartVideoUploadDto {
  @IsString()
  @MaxLength(120)
  title: string;

  @IsString()
  @MaxLength(255)
  original_file_name: string;

  @IsMimeType()
  @MaxLength(120)
  mime_type: string;

  @IsInt()
  @IsPositive()
  size_bytes: number;
}
